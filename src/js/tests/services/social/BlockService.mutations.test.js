import { jest } from "@jest/globals";

const doc = jest.fn((db, ...parts) => ({ __doc: true, db, parts }));
const setDoc = jest.fn(() => Promise.resolve());
const deleteDoc = jest.fn(() => Promise.resolve());
const serverTimestamp = jest.fn(() => "server-ts");
const getDoc = jest.fn(() =>
  Promise.resolve({
    exists: () => false,
  })
);

jest.unstable_mockModule("firebase/firestore", () => ({
  doc,
  setDoc,
  deleteDoc,
  serverTimestamp,
  getDoc,
  collection: jest.fn(),
  onSnapshot: jest.fn(),
}));

const firebaseConfigModule = `${process.cwd()}/src/js/lib/firebase/firebase-config.js`;
jest.unstable_mockModule(firebaseConfigModule, () => ({
  db: { __db: true },
}));

const blockServiceModule = `${process.cwd()}/src/js/services/social/BlockService.js`;
const { blockService } = await import(blockServiceModule);

describe("BlockService mutations", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.logManager = { dev: { debug: jest.fn() } };
  });

  test("persistBlock(true) creates /users/{userId}/blocks/{targetId}", async () => {
    await blockService.persistBlock("u1", "u2", true);
    expect(doc).toHaveBeenCalledWith({ __db: true }, "users", "u1", "blocks", "u2");
    expect(getDoc).toHaveBeenCalled();
    expect(setDoc).toHaveBeenCalledWith(
      expect.objectContaining({ __doc: true }),
      expect.objectContaining({
        targetId: "u2",
        createdAt: "server-ts",
      }),
      { merge: true }
    );
  });

  test("persistBlock(false) deletes /users/{userId}/blocks/{targetId}", async () => {
    await blockService.persistBlock("u1", "u2", false);
    expect(doc).toHaveBeenCalledWith({ __db: true }, "users", "u1", "blocks", "u2");
    expect(deleteDoc).toHaveBeenCalledWith(expect.objectContaining({ __doc: true }));
  });
});
