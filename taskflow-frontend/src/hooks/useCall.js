import { useContext } from "react";
import CallContext from "../context/callContext";

// const { startCall, inCall } = useCall();
export default function useCall() {
  return useContext(CallContext);
}