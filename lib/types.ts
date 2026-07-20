// Oyun için ortak TypeScript tipleri

export type Team = "koy" | "vampir";

export type GameStatus = "lobby" | "in_progress" | "ended";
export type GameMode = "phone" | "verbal";
export type Phase = "night" | "day";

export interface RoleConfig {
  key: string; // benzersiz anahtar, örn "vampir"
  name: string; // görünen ad
  team: Team; // kazanma hesabı için taraf
  enabled: boolean; // bu oyunda aktif mi
  count: number; // kaç kişiye dağıtılacak (fill=true olan hariç)
  fill?: boolean; // geri kalan herkes bu role atanır (Köylü)
  builtin?: boolean; // varsayılan rol mü (silinemez)
  special?: "avci" | "doktor" | "medyum"; // özel yetenek işaretçisi
}

export interface Player {
  id: string; // istemcide localStorage'da saklanır
  name: string;
  role: string | null; // atanan rol anahtarı
  alive: boolean;
  joinedAt: number;
}

export interface VoteState {
  active: boolean;
  votes: Record<string, string>; // voterPlayerId -> targetPlayerId
}

export interface Game {
  _id: string; // sabit "active"
  status: GameStatus;
  mode: GameMode;
  phase: Phase;
  dayNumber: number;
  roles: RoleConfig[];
  players: Player[];
  vote: VoteState;
  pendingHunterId: string | null; // asılan avcı, atış hakkı bekliyor
  winner: Team | null;
  log: { text: string; at: number }[];
  version: number; // her değişimde artar (SSE değişiklik tespiti)
  updatedAt: number;
}

// SSE ile istemciye gönderilen projeksiyonlar
export interface ModeratorView {
  role: "moderator";
  game: Game;
  tally: { targetId: string; targetName: string; count: number }[];
  version: number;
}

export interface ParticipantSelf {
  id: string;
  name: string;
  role: RoleConfig | null;
  alive: boolean;
}

export interface ParticipantView {
  role: "participant";
  exists: boolean; // oyuncu hâlâ oyunda mı (kick/reset tespiti)
  status: GameStatus;
  mode: GameMode;
  phase: Phase;
  self: ParticipantSelf | null;
  players: { id: string; name: string; alive: boolean }[];
  vote: { active: boolean; myVote: string | null };
  winner: Team | null;
  // Oyun bitince tüm roller açığa çıkar
  reveal: { id: string; name: string; roleName: string | null; team: Team | null; alive: boolean }[] | null;
  version: number;
}
