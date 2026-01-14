import app, { db } from "../../lib/firebase/firebase-config.js";
import {
  doc,
  setDoc,
  serverTimestamp,
  collection,
  query,
  where,
  getDocs,
  deleteDoc,
} from "firebase/firestore";
import { authManager } from "../auth/AuthService.js";

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[randInt(0, arr.length - 1)];
}

const SAMPLE = [
  { code: "CSC101", name: "introduction to computer science", section: 2, day: "MW", start: "11:20", end: "12:50", slot: "1120-1250", room: "NAC902" },
  { code: "MAT105", name: "calculus i", section: 1, day: "TR", start: "09:40", end: "11:10", slot: "0940-1110", room: "BC6012" },
  { code: "CSC212", name: "microprocessor, interfacing & assembly language", section: 4, day: "MW", start: "13:00", end: "14:30", slot: "1300-1430", room: "C3002" },
  { code: "CSC213L", name: "data structures lab", section: 3, day: "ST", start: "14:40", end: "16:10", slot: "1440-1610", room: "MK7005L" },
];

function makeSpaceId(uni, c) {
  const sec = String(c.section).padStart(2, "0");
  const slug = (c.code || c.name || "course").toLowerCase().replace(/\s+/g, "-");
  return `${uni}__${slug}__sec${sec}__${c.day}__${c.slot}__${(c.room || '').toUpperCase()}`;
}

export async function createDevSpacesForUser(count = 2) {
  const uid = authManager?.auth?.currentUser?.uid;
  if (!uid) throw new Error("Not signed in");
  const uni = (window?.ENV?.UNIVERSITY_KEY || "iub").toLowerCase();
  const created = [];
  for (let i = 0; i < count; i++) {
    const c = pick(SAMPLE);
    const spaceId = makeSpaceId(uni, c) + `__dev_${uid.substring(0, 6)}_${Date.now()}_${i}`;
    const ref = doc(db, "classSpaces", spaceId);
    const memberIds = [uid];
    const memberInfo = {};
    memberInfo[uid] = { handle: "you", firstName: "You", lastName: "", major: "", avatarConfig: null, profilePhotoUrl: null };
    const payload = {
      spaceId,
      university: uni,
      courseName: c.name,
      courseCode: c.code,
      section: c.section,
      dayPattern: c.day,
      timeSlot: c.slot,
      timeStart: c.start,
      timeEnd: c.end,
      classroom: c.room,
      memberIds,
      memberCount: memberIds.length,
      memberInfo,
      active: true,
      lastActivity: serverTimestamp(),
      lastMessagePreview: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      visibility: "university",
      devTest: true,
      devOwnerUid: uid,
    };
    await setDoc(ref, payload, { merge: true });
    created.push(spaceId);
  }
  return created;
}

export async function clearMyDevSpaces() {
  const uid = authManager?.auth?.currentUser?.uid;
  if (!uid) throw new Error("Not signed in");
  const q = query(collection(db, "classSpaces"), where("devOwnerUid", "==", uid));
  const snap = await getDocs(q);
  const removed = [];
  for (const d of snap.docs) {
    await deleteDoc(d.ref);
    removed.push(d.id);
  }
  return removed;
}

export default { createDevSpacesForUser, clearMyDevSpaces };

