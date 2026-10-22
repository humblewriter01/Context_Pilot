import React, { useState, useEffect } from 'react';
import { User } from 'lucide-react';

export function formatDisplayName(displayName?: string | null, email?: string | null): string {
  const trimmed = displayName?.trim();
  const trimmedEmail = email?.trim() || '';

  // If display name is empty or identical to email
  if (!trimmed || (trimmedEmail && trimmed.toLowerCase() === trimmedEmail.toLowerCase())) {
    if (trimmedEmail.includes('@')) {
      const handle = trimmedEmail.split('@')[0];
      if (handle) return handle;
    }
    return 'Developer';
  }

  // If display name is itself an email address
  if (trimmed.includes('@')) {
    const handle = trimmed.split('@')[0];
    if (handle) return handle;
  }

  return trimmed;
}

interface UserAvatarProps {
  photoUrl?: string | null;
  displayName?: string | null;
  email?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export const UserAvatar: React.FC<UserAvatarProps> = ({
  photoUrl,
  displayName,
  email,
  size = 'md',
  className = '',
}) => {
  const [imgError, setImgError] = useState(false);

  // Reset error state if photoUrl changes
  useEffect(() => {
    setImgError(false);
  }, [photoUrl]);

  const cleanName = formatDisplayName(displayName, email);
  const initial = (cleanName || email || 'D').trim().charAt(0).toUpperCase();

  const sizeClasses = {
    xs: 'w-6 h-6 text-[10px]',
    sm: 'w-8 h-8 text-xs',
    md: 'w-9 h-9 text-xs',
    lg: 'w-11 h-11 text-sm',
    xl: 'w-14 h-14 text-base',
  }[size];

  const hasValidPhoto = Boolean(photoUrl && photoUrl.trim().length > 0 && !imgError);

  if (hasValidPhoto) {
    return (
      <img
        src={photoUrl!}
        alt={cleanName}
        onError={() => setImgError(true)}
        className={`${sizeClasses} rounded-full border border-slate-200/80 object-cover shadow-2xs shrink-0 select-none ${className}`}
      />
    );
  }

  // Initials / Silhouette Fallback
  return (
    <div
      className={`${sizeClasses} rounded-full bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-700 text-white font-bold flex items-center justify-center border border-indigo-400/30 shadow-2xs shrink-0 select-none tracking-tight ${className}`}
      title={cleanName}
      aria-label={cleanName}
    >
      {initial ? (
        <span>{initial}</span>
      ) : (
        <User className="w-1/2 h-1/2 text-white/90" />
      )}
    </div>
  );
};
