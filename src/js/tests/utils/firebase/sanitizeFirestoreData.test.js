import { sanitizeFirestoreData } from "../../../utils/firebase/sanitizeFirestoreData.js";

describe("sanitizeFirestoreData", () => {
  test("removes undefined recursively in objects and arrays", () => {
    const input = {
      a: 1,
      b: undefined,
      c: {
        d: undefined,
        e: "ok",
        f: [1, undefined, { g: undefined, h: 2 }],
      },
    };

    expect(sanitizeFirestoreData(input)).toEqual({
      a: 1,
      c: {
        e: "ok",
        f: [1, { h: 2 }],
      },
    });
  });

  test("preserves non-plain objects (e.g. Firestore FieldValue sentinels)", () => {
    class FakeFieldValue {
      constructor(name) {
        this.name = name;
      }
    }

    const sentinel = new FakeFieldValue("serverTimestamp");
    const input = {
      createdAt: sentinel,
      nested: { x: undefined, y: sentinel },
    };

    const out = sanitizeFirestoreData(input);
    expect(out.createdAt).toBe(sentinel);
    expect(out.nested.y).toBe(sentinel);
    expect(out.nested.x).toBeUndefined();
  });
});

