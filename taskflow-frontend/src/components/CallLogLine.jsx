import { formatTime, dayLabel } from "../utils/chatHelpers";
import { describeCallLog } from "../utils/callHelpers";

const CALL_BACK_STATUSES = ["missed", "cancelled", "declined"];

// One call in the conversation history, shown as a centered line
function CallLogLine({ message, mine, showDay, canCallBack, onCallBack }) {
  const call = message.call;
  // a call I did not get to answer
  const missedByMe =
    !mine && (call.status === "missed" || call.status === "cancelled");

  return (
    <div>
      {showDay && (
        <div className="text-center my-4">
          <span className="text-xs text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
            {dayLabel(message.createdAt)}
          </span>
        </div>
      )}

      <div className="flex justify-center my-3">
        <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-full px-4 py-1.5 text-sm">
          <span>{call.type === "video" ? "🎥" : "📞"}</span>
          <span className={missedByMe ? "text-red-600 font-medium" : "text-gray-600"}>
            {describeCallLog(call, mine)}
          </span>
          <span className="text-xs text-gray-400">{formatTime(message.createdAt)}</span>

          {CALL_BACK_STATUSES.includes(call.status) && (
            <button
              type="button"
              onClick={onCallBack}
              disabled={!canCallBack}
              className="text-xs font-medium text-blue-600 hover:text-blue-800 disabled:text-gray-300 disabled:cursor-not-allowed"
            >
              Call back
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default CallLogLine;