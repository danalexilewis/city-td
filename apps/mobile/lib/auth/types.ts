/** Row shape from public.profiles (client-readable fields). */
export type Profile = {
  id: string;
  nickname: string;
  is_team: boolean;
  debug_logging: boolean;
};

/** True when the player has chosen a display nickname. */
export function hasNickname(profile: Profile | null): boolean {
  return Boolean(profile?.nickname.trim());
}
