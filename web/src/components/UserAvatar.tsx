import { getInitial, getAvatarColor, hasRealAvatar } from "../utils/avatar";

export default function UserAvatar({ userId, avatar, size = 36 }: { userId: string; avatar?: string; size?: number }) {
  const px = `${size}px`;
  if (hasRealAvatar(avatar)) {
    return <img src={avatar} alt="" className="rounded-full object-cover flex-shrink-0 shadow-sm" style={{ width: px, height: px }} />;
  }
  return (
    <div className={`rounded-full bg-gradient-to-br ${getAvatarColor(userId)} flex items-center justify-center text-white font-semibold flex-shrink-0 shadow-sm`} style={{ width: px, height: px, fontSize: `${Math.round(size * 0.33)}px` }}>
      {getInitial(userId)}
    </div>
  );
}
