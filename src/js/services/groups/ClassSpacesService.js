import app, {
  db,
  auth,
  getFunctionsInstance,
} from "../../lib/firebase/firebase-config.js";
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
  where,
  documentId,
} from "firebase/firestore";
import { callFunction } from "../../utils/firebase/functionsHelper.js";

export class ClassSpacesService {
  async ensureSignedInUser(timeoutMs = 2500) {
    try {
      if (auth?.currentUser) return auth.currentUser;
      const { onAuthStateChanged } = await import("firebase/auth");
      return new Promise((resolve) => {
        let done = false;
        const timeout = setTimeout(() => {
          if (done) return;
          done = true;
          resolve(null);
        }, timeoutMs);

        const unsub = onAuthStateChanged(auth, (user) => {
          if (done) return;
          done = true;
          clearTimeout(timeout);
          try {
            unsub();
          } catch (error) { console.debug("Suppressed error", error); }
          resolve(user || null);
        });
      });
    } catch (_) {
      return auth?.currentUser || null;
    }
  }

  isLocalhost() {
    return (
      typeof window !== "undefined" &&
      (window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1")
    );
  }

  async callFunctionsEmulatorDirect(functionName, data = {}) {
    const user = await this.ensureSignedInUser();
    if (!user?.uid) {
      console.error("[ClassSpacesService] No signed-in user found");
      throw new Error("Must be signed in");
    }

    const projectId = app?.options?.projectId;
    if (!projectId) {
      throw new Error("Missing Firebase projectId");
    }

    let idToken;
    try {
      idToken = await user.getIdToken(true); // force refresh
      console.log(
        "[ClassSpacesService] Got ID token for",
        user.uid,
        "token length:",
        idToken?.length,
      );
    } catch (tokenErr) {
      console.error("[ClassSpacesService] Failed to get ID token:", tokenErr);
      throw new Error("Failed to get auth token");
    }

    const url = `http://localhost:5001/${projectId}/us-central1/${functionName}`;
    console.log("[ClassSpacesService] Calling emulator:", url);

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ data }),
    });

    console.log("[ClassSpacesService] Response status:", res.status);

    const text = await res.text();
    console.log("[ClassSpacesService] Raw response text:", text);
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch (_) {
      json = null;
    }

    if (!res.ok) {
      console.error(
        "[ClassSpacesService] Function error response:",
        JSON.stringify(json, null, 2),
      );
      const msg =
        json?.error?.message ||
        json?.error?.status ||
        json?.message ||
        `Function ${functionName} failed`;
      const err = new Error(msg);
      err.code = json?.error?.status || "functions/unknown";
      throw err;
    }

    // Callable protocol responses can include { result } or { data }
    return json?.result ?? json?.data ?? json;
  }

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
      qLimit(pageSize),
    );
    const snap = await getDocs(q);
    const items = [];
    snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
    // Reverse to maintain oldest-to-newest order in UI
    return { items: items.reverse(), docs: snap.docs.slice().reverse() };
  }

  async sendMessage(spaceId, content) {
    // Ensure signed-in user
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
        const { getFunctions, httpsCallable, connectFunctionsEmulator } =
          await import("firebase/functions");
        const functions = getFunctions(app, "us-central1");
        const isLocal = this.isLocalhost();

        // Emulator workaround: call direct with explicit Authorization header.
        if (isLocal) {
          const res = await this.callFunctionsEmulatorDirect(
            "sendGroupMessage",
            {
              spaceId,
              content,
            },
          );
          return res?.messageId || null;
        }

        try {
          connectFunctionsEmulator(functions, "localhost", 5001);
        } catch (error) { console.debug("Suppressed error", error); }
        const callable = httpsCallable(functions, "sendGroupMessage");
        const res = await callable({ spaceId, content });
        return res?.data?.messageId || null;
      } catch (e2) {
        throw e2;
      }
    }
  }

  /**
   * Leave a class space
   * @param {string} spaceId - The space to leave
   * @returns {Promise<{success: boolean}>}
   */
  async leaveSpace(spaceId) {
    const user = await this.ensureSignedInUser();
    if (!user?.uid) {
      throw new Error("Must be signed in");
    }

    // Warm token so callable attaches Authorization reliably
    try {
      await user.getIdToken(true);
    } catch (error) { console.debug("Suppressed error", error); }

    const { httpsCallable } = await import("firebase/functions");
    const functions = await getFunctionsInstance();
    const callable = httpsCallable(functions, "leaveClassSpace");
    const res = await callable({ spaceId });
    return res?.data || { success: true };
  }

  /**
   * Rejoin a class space that was previously left
   * @param {string} spaceId - The space to rejoin
   * @returns {Promise<{success: boolean, memberCount?: number}>}
   */
  async rejoinSpace(spaceId) {
    const user = await this.ensureSignedInUser();
    if (!user?.uid) {
      throw new Error("Must be signed in");
    }

    // Warm token so callable attaches Authorization reliably
    try {
      await user.getIdToken(true);
    } catch (error) { console.debug("Suppressed error", error); }

    const { httpsCallable } = await import("firebase/functions");
    const functions = await getFunctionsInstance();
    const callable = httpsCallable(functions, "rejoinClassSpace");
    const res = await callable({ spaceId });
    return res?.data || { success: true };
  }

  /**
   * Get user's left spaces that are still active
   * @returns {Promise<Array<{space: object, canRejoinToday: boolean}>>}
   */
  async getLeftSpaces() {
    const uid = auth?.currentUser?.uid || null;
    if (!uid) {
      return [];
    }
    // SECURITY (C15): after disabling client-side list on /classSpaces, users who left a space
    // can no longer read the space doc. Fetch rejoinable summaries via Cloud Function.
    const res = await callFunction("listMyLeftClassSpaces", {});
    const items = Array.isArray(res?.data?.items) ? res.data.items : [];
    return items.map((item) => ({
      space: item.space,
      canRejoinToday: item.canRejoinToday === true,
      leftAt: item.leftAtMs ? new Date(item.leftAtMs) : null,
      lastRejoinDate: item.lastRejoinDate || null,
    }));
  }
}

export const classSpacesService = new ClassSpacesService();
export default classSpacesService;
