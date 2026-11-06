// The sync service's Worker: requests are checked in api.js, and each profile's records live
// in its own Durable Object (profile.js). The runtime allows only handlers and classes as
// exports here, so everything else stays in those files.
import { handle } from "./api.js";
export { Profile } from "./profile.js";
export default { fetch: handle };
