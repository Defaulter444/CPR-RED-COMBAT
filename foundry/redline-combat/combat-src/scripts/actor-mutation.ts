/** Serialize module read/modify/write operations on the same real or synthetic actor. */
const mutations = new Map<string, Promise<unknown>>();
export function withActorMutation<T>(actor: Actor, run: () => Promise<T>): Promise<T> {
  const key = actor.uuid;
  const next = (mutations.get(key) ?? Promise.resolve()).catch(() => {}).then(run);
  mutations.set(key, next);
  void next.finally(() => { if (mutations.get(key) === next) mutations.delete(key); }).catch(() => {});
  return next;
}
