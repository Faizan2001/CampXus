import app, { db } from "../../lib/firebase/firebase-config.js";
import {
  doc,
  getDoc,
  collection,
  query,
  orderBy,
  limit as qLimit,
  limitToLast,
  startAfter,
  endBefore,
  onSnapshot,
  addDoc,
  updateDoc,
  serverTimestamp,
  getDocs,
} from "firebase/firestore";

export class ClassSpacesService {
  async getSpace(spaceId) {
    const ref = doc(db, "classSpaces", spaceId);
    const snap = await getDoc(ref);
    return snap.exists() ? { spaceId, ...snap.data() } : null;
  }

  listenToMessages(spaceId, onChange, { pageSize = 50 } = {}) {
    const ref = collection(db, "classSpaces", spaceId, "messages");
    // Use descending order to get latest messages first
    const q = query(ref, orderBy("createdAt", "desc"), qLimit(pageSize));
    return onSnapshot(q, (snap) => {
      const items = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
      // Reverse to show oldest-to-newest in UI (chat convention)
      onChange(items.reverse(), snap.docs.slice().reverse());
    });
  }

  async loadMore(spaceId, firstDoc, { pageSize = 50 } = {}) {
    const ref = collection(db, "classSpaces", spaceId, "messages");
    // Continue with desc order to get older messages (before firstDoc)
    const q = query(
      ref,
      orderBy("createdAt", "desc"),
      startAfter(firstDoc),
      qLimit(pageSize)
    );
    const snap = await getDocs(q);
    const items = [];
    snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
    // Reverse to maintain oldest-to-newest order in UI
    return { items: items.reverse(), docs: snap.docs.slice().reverse() };
  }

  async sendMessage(spaceId, content) {
    // Ensure signed-in user
    const { getAuth } = await import("firebase/auth");
    const auth = getAuth(app);
    const uid = auth?.currentUser?.uid || null;
    if (!uid) {
      throw new Error("Must be signed in");
    }
    // Load space metadata to choose path
    const space = await this.getSpace(spaceId);
    // Dev test spaces: write directly (onCreate trigger will coalesce metadata)
    if (
      space?.devTest === true &&
      Array.isArray(space.memberIds) &&
      space.memberIds.includes(uid)
    ) {
      const messagesRef = collection(db, "classSpaces", spaceId, "messages");
      const ref = await addDoc(messagesRef, {
        senderId: uid,
        content,
        createdAt: serverTimestamp(),
        edited: false,
        editedAt: null,
        deleted: false,
      });
      return ref.id;
    }

    // Preferred path for production spaces: direct write (rules validate membership)
    try {
      if (Array.isArray(space?.memberIds) && space.memberIds.includes(uid)) {
        const messagesRef = collection(db, "classSpaces", spaceId, "messages");
        const ref = await addDoc(messagesRef, {
          senderId: uid,
          content,
          createdAt: serverTimestamp(),
          edited: false,
          editedAt: null,
          deleted: false,
        });
        return ref.id;
      }
      throw new Error("Not a member");
    } catch (directErr) {
      console.warn("Direct write failed, trying callable path", directErr);
      try {
        const { getFunctions, httpsCallable, connectFunctionsEmulator } = await import(
          "firebase/functions"
        );
        const functions = getFunctions(app, "us-central1");
        const isLocal =
          typeof window !== "undefined" &&
          (window.location.hostname === "localhost" ||
            window.location.hostname === "127.0.0.1");
        if (isLocal) {
          try { connectFunctionsEmulator(functions, "localhost", 5001); } catch (_) {}
        }
        const callable = httpsCallable(functions, "sendGroupMessage");
        const res = await callable({ spaceId, content });
        return res?.data?.messageId || null;
      } catch (e2) {
        throw e2;
      }
    }
  }
}

export const classSpacesService = new ClassSpacesService();
export default classSpacesService;
