import {registerNativeWrapper} from './native-wrappers.js';

/** v12 updateMessage otherwise posts a second copy while postOne awaits getHTML. */
export function installChatRenderGuard(prototype: object): void {
  const states = new WeakMap<object, {posts: Map<string, Promise<unknown>>; updates: Map<string, Promise<unknown>>}>();
  const state = (log: object) => {
    let value = states.get(log);
    if (!value) { value = {posts:new Map(),updates:new Map()}; states.set(log,value); }
    return value;
  };
  const track = (map: Map<string, Promise<unknown>>, id: string, work: () => unknown) => {
    const pending = Promise.resolve().then(work);
    map.set(id,pending);
    const clear = () => { if (map.get(id) === pending) map.delete(id); };
    void pending.then(clear,clear);
    return pending;
  };
  registerNativeWrapper(prototype,'postOne',function(wrapped,message: ChatMessage,...args) {
    if (!message.id) return wrapped(message,...args);
    const posts = state(this).posts;
    return posts.get(message.id) ?? track(posts,message.id,()=>wrapped(message,...args));
  },'MIXED');
  registerNativeWrapper(prototype,'updateMessage',function(wrapped,message: ChatMessage,...args) {
    if (!message.id) return wrapped(message,...args);
    const current = state(this), previous = current.updates.get(message.id);
    return track(current.updates,message.id,async()=>{
      await previous?.catch(()=>{});
      await current.posts.get(message.id!)?.catch(()=>{});
      return wrapped(message,...args);
    });
  },'WRAPPER');
}
