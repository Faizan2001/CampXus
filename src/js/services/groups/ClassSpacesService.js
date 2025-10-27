import app, { db } from "../../lib/firebase/firebase-config.js";
import {
  doc,
  getDoc,
  collection,
  query,
  orderBy,
  limit as qLimit,
  startAfter,
  onSnapshot,
  addDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";

export class ClassSpacesService {
  async getSpace(spaceId) {
    const ref = doc(db, "classSpaces", spaceId);
    const snap = await getDoc(ref);
    return snap.exists() ? { spaceId, ...snap.data() } : null;
  }

  listenToMessages(spaceId, onChange, { pageSize = 50 } = {}) {
    const ref = collection(db, "classSpaces", spaceId, "messages");
    const q = query(ref, orderBy("createdAt"), qLimit(pageSize));
    return onSnapshot(q, (snap) => {
      const items = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
      onChange(items, snap.docs);
    });
  }

  async loadMore(spaceId, lastDoc, { pageSize = 50 } = {}) {
    const ref = collection(db, "classSpaces", spaceId, "messages");
    const q = query(ref, orderBy("createdAt"), startAfter(lastDoc), qLimit(pageSize));
    const snap = await (await import("firebase/firestore")).getDocs(q);
    const items = [];
    snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
    return { items, docs: snap.docs };
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
      const functions = getFunctions(app);
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
