import { jest } from "@jest/globals";

const addDoc = jest.fn(() => Promise.resolve());
const collection = jest.fn(() => ({ __collection: true }));
const serverTimestamp = jest.fn(() => "server-ts");

// Provide a complete enough Firestore surface for AdminService's imports
jest.unstable_mockModule("firebase/firestore", () => ({
  doc: jest.fn(),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  setDoc: jest.fn(),
  updateDoc: jest.fn(),
  deleteDoc: jest.fn(),
  deleteField: jest.fn(),
  collection,
  collectionGroup: jest.fn(),
  addDoc,
  query: jest.fn(),
  where: jest.fn(),
  writeBatch: jest.fn(() => ({ commit: jest.fn(() => Promise.resolve()) })),
  serverTimestamp,
  orderBy: jest.fn(),
  limit: jest.fn(),
}));

const firebaseConfigModule = `${process.cwd()}/src/js/lib/firebase/firebase-config.js`;
jest.unstable_mockModule(firebaseConfigModule, () => ({
  db: { __db: true },
}));

const logManagerModule = `${process.cwd()}/src/js/utils/debug/LogManager.js`;
jest.unstable_mockModule(logManagerModule, () => ({
  logManager: {
    warn: jest.fn(),
    system: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
  },
}));

const userStoreModule = `${process.cwd()}/src/js/store/userStore.js`;
jest.unstable_mockModule(userStoreModule, () => ({
  currentUser: {
    profile: { uid: "actor-uid" },
  },
}));

const functionsHelperModule = `${process.cwd()}/src/js/utils/firebase/functionsHelper.js`;
jest.unstable_mockModule(functionsHelperModule, () => ({
  callFunction: jest.fn(),
}));

const adminServiceModule = `${process.cwd()}/src/js/services/admin/AdminService.js`;
const { logAdminAuditEvent } = await import(adminServiceModule);

describe("AdminService mutations", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("logAdminAuditEvent writes to /adminActivity with trimmed term", async () => {
    const longTerm = "x".repeat(200);
    await logAdminAuditEvent("admin_user_search", { term: longTerm });

    expect(collection).toHaveBeenCalledWith({ __db: true }, "adminActivity");
    expect(addDoc).toHaveBeenCalledTimes(1);

    const [, payload] = addDoc.mock.calls[0];
    expect(payload.type).toBe("admin_user_search");
    expect(payload.actorUid).toBe("actor-uid");
    expect(payload.createdAt).toBe("server-ts");
    expect(payload.term.length).toBeLessThanOrEqual(120);
  });
});
