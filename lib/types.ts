// Oyun için ortak TypeScript tipleri

export type Team = "koy" | "vampir";

export type GameStatus = "lobby" | "in_progress" | "ended";
export type GameMode = "phone" | "verbal";
export type Phase = "night" | "day";
// Rol dağıtım yöntemi: rastgele (varsayılan) veya moderatör elle atar
export type AssignMode = "random" | "manual";

// Gece sırasında aktif olan rol grupları
export type NightRole = "vampir" | "doktor" | "medyum";

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

// Gece motoru durumu (telefon modu). Roller kendi telefonlarından sırayla oynar.
export interface NightState {
  active: boolean; // gece motoru çalışıyor mu
  order: NightRole[]; // bu gece oynayacak grupların sırası
  step: number; // order içindeki geçerli grup indeksi
  vampireVotes: Record<string, string>; // vampirId -> hedefId
  doctorTarget: string | null; // doktorun koruduğu
  mediumTarget: string | null; // medyumun incelediği (bu gece)
}

// Medyumun gece boyunca öğrendiği bilgiler (kişiye özel geçmiş)
export interface MediumReading {
  mediumId: string;
  targetId: string;
  targetName: string;
  team: Team;
  day: number;
}

// Sabah / infaz duyurusu — herkese gösterilir
export interface Announcement {
  kind: "morning" | "hang" | "hunter" | "info";
  title: string;
  lines: string[];
  dead: { name: string; roleName: string; team: Team } | null;
  at: number;
}

export interface Game {
  _id: string; // sabit "active"
  status: GameStatus;
  mode: GameMode;
  assignMode: AssignMode; // rol dağıtımı rastgele mi moderatör mü seçiyor
  phase: Phase;
  dayNumber: number;
  roles: RoleConfig[];
  players: Player[];
  vote: VoteState;
  night: NightState;
  mediumLog: MediumReading[];
  doctorSelfUsed: string[]; // kendini koruma hakkını kullanan doktor id'leri (oyun boyu 1 kez)
  announcement: Announcement | null;
  pendingHunterId: string | null; // asılan avcı, atış hakkı bekliyor
  hangedThisDay: boolean; // bu gündüz birisi asıldı mı (yeni geceye geçiş şartı)
  winner: Team | null;
  log: { text: string; at: number }[];
  version: number; // her değişimde artar (SSE değişiklik tespiti)
  updatedAt: number;
}

// SSE ile istemciye gönderilen projeksiyonlar

// Moderatöre gece ilerlemesinin özeti
export interface NightSummary {
  role: NightRole | null; // şu an oynayan grup
  label: string; // "Vampirler seçiyor" gibi
  waiting: string[]; // henüz oynamamış oyuncu isimleri
}

export interface ModeratorView {
  role: "moderator";
  game: Game;
  tally: { targetId: string; targetName: string; count: number }[];
  night: NightSummary | null;
  version: number;
}

// Katılımcının o an yapması gereken aksiyon
export interface TurnInfo {
  kind: NightRole | "hunter";
  candidates: { id: string; name: string }[]; // seçilebilecek hedefler
  myPick: string | null; // mevcut seçim
  note?: string; // ekranda gösterilecek küçük ipucu (örn. doktor self-protect durumu)
  // Yalnızca vampirler: takım arkadaşlarının canlı seçim sayımı
  teamPicks?: { id: string; name: string; count: number }[];
}

export interface ParticipantSelf {
  id: string;
  name: string;
  role: RoleConfig | null;
  alive: boolean;
  teammates: { id: string; name: string }[]; // vampirler için diğer vampirler
  readings: { targetName: string; team: Team; day: number }[]; // medyum için
}

export interface ParticipantView {
  role: "participant";
  forPlayerId: string | null; // bu görünüm hangi playerId için üretildi (stale veri ayrımı)
  exists: boolean; // oyuncu hâlâ oyunda mı (kick/reset tespiti)
  status: GameStatus;
  mode: GameMode;
  phase: Phase;
  dayNumber: number;
  self: ParticipantSelf | null;
  players: { id: string; name: string; alive: boolean }[];
  vote: {
    active: boolean;
    myVote: string | null;
    count: number;
    total: number;
    // Oylama sırasında her adayın aldığı oy sayısı (herkes canlı görür)
    tally: { targetId: string; count: number }[];
  };
  turn: TurnInfo | null; // sıra bendeyse dolu
  nightActive: boolean;
  announcement: Announcement | null;
  winner: Team | null;
  // Oyun bitince tüm roller açığa çıkar
  reveal:
    | { id: string; name: string; roleName: string | null; team: Team | null; alive: boolean }[]
    | null;
  version: number;
}
