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
    const q = query(ref, orderBy("createdAt", "desc"), startAfter(firstDoc), qLimit(pageSize));
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
    // If this is a dev test space you own, bypass CF to avoid 401 noise in dev
    const space = await this.getSpace(spaceId);
    if (space?.devTest === true && Array.isArray(space.memberIds) && space.memberIds.includes(uid)) {
      const messagesRef = collection(db, "classSpaces", spaceId, "messages");
      const ref = await addDoc(messagesRef, {
        senderId: uid,
        senderInfo: {},
        content,
        createdAt: serverTimestamp(),
        edited: false,
        editedAt: null,
        deleted: false,
      });
      await updateDoc(doc(db, "classSpaces", spaceId), {
        lastActivity: serverTimestamp(),
        lastMessagePreview: { content: content.slice(0, 140), senderId: uid, createdAt: serverTimestamp() },
      });
      return ref.id;
    }

    try {
      const { getFunctions, httpsCallable } = await import("firebase/functions");
      // Use explicit region to match deployed functions and avoid 401/mismatch
      const functions = getFunctions(app, 'us-central1');
      const callable = httpsCallable(functions, "sendGroupMessage");
      const res = await callable({ spaceId, content });
      return res?.data?.messageId || null;
    } catch (e) {
      // Fallback for dev test spaces (if server auth failed due to 401 in dev)
      const msg = String(e?.message || "");
      const unauth = msg.includes("unauthenticated") || msg.includes("Must be signed in") || msg.includes("401");
      if (!unauth) throw e;
      if (space?.devTest === true && Array.isArray(space.memberIds) && space.memberIds.includes(uid)) {
        // Write directly to messages and update metadata
        const messagesRef = collection(db, "classSpaces", spaceId, "messages");
        const ref = await addDoc(messagesRef, {
          senderId: uid,
          senderInfo: {},
          content,
          createdAt: serverTimestamp(),
          edited: false,
          editedAt: null,
          deleted: false,
        });
        await updateDoc(doc(db, "classSpaces", spaceId), {
          lastActivity: serverTimestamp(),
          lastMessagePreview: { content: content.slice(0, 140), senderId: uid, createdAt: serverTimestamp() },
        });
        return ref.id;
      }
      throw e;
    }
  }
}

export const classSpacesService = new ClassSpacesService();
export default classSpacesService;
