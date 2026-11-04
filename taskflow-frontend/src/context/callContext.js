import { createContext } from "react";

const CallContext = createContext({
  startCall: () => {},
  inCall: false,
});

export default CallContext; 