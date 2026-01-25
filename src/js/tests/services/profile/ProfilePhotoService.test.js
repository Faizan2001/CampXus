import { jest } from "@jest/globals";

const getStorageInstance = jest.fn(() => Promise.reject(new Error("no storage")));

const firebaseConfigModule = `${process.cwd()}/src/js/lib/firebase/firebase-config.js`;
jest.unstable_mockModule(firebaseConfigModule, () => ({
  getStorageInstance,
}));

jest.unstable_mockModule("firebase/storage", () => ({
  ref: jest.fn(),
  deleteObject: jest.fn(() => Promise.resolve()),
  uploadBytes: jest.fn(() => Promise.resolve()),
  getDownloadURL: jest.fn(() => Promise.resolve("https://example.com/x.webp")),
}));

const profilePhotoServiceModule = `${process.cwd()}/src/js/services/profile/ProfilePhotoService.js`;
const { deleteExistingProfilePhotos } = await import(profilePhotoServiceModule);

describe("ProfilePhotoService", () => {
  test("deleteExistingProfilePhotos() does not throw on storage failures", async () => {
    await expect(deleteExistingProfilePhotos("u1")).resolves.toBeUndefined();
  });
});
