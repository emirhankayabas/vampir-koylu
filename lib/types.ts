// Oyun için ortak TypeScript tipleri

export type Team = "koy" | "vampir";
// Kazanan taraf: köy, vampir ya da tarafsız Soytarı (astırılırsa tek başına kazanır).
export type Winner = Team | "soytari";

export type GameStatus = "lobby" | "in_progress" | "ended";
export type GameMode = "phone" | "verbal";
export type Phase = "night" | "day";
// Rol dağıtım yöntemi: rastgele (varsayılan) veya moderatör elle atar
export type AssignMode = "random" | "manual";

// Gece sırasında aktif olan rol grupları
export type NightRole = "vampir" | "doktor" | "medyum" | "survivor";

// Özel yetenek / tarafsızlık işaretçisi. Tek kaynaktan yönetilir; rol meta
// verisi (lib/roles.ts) ve motor bu anahtarlara göre davranır.
export type SpecialKey = "avci" | "doktor" | "medyum" | "soytari" | "survivor";

export interface RoleConfig {
  key: string; // benzersiz anahtar, örn "vampir"
  name: string; // görünen ad
  team: Team; // kazanma hesabı için taraf
  enabled: boolean; // bu oyunda aktif mi
  count: number; // kaç kişiye dağıtılacak (fill=true olan hariç)
  fill?: boolean; // geri kalan herkes bu role atanır (Köylü)
  builtin?: boolean; // varsayılan rol mü (silinemez)
  special?: SpecialKey; // özel yetenek / tarafsız işaretçisi
}

export interface Player {
  id: string; // istemcide localStorage'da saklanır
  name: string;
  // Kayıtlı hesapla katıldıysa hesabın kimliği; ziyaretçiyse null. Maç geçmişi
  // ve "hesaba göre rol dağıtımı" bu alan üzerinden bağlanır.
  userId: string | null;
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
  survivorShields: string[]; // bu gece kalkanını açan Survivor id'leri
  survivorDecided: string[]; // bu gece kalkan kararını (kullan/geç) veren Survivor id'leri
}

// Medyumun gece boyunca öğrendiği bilgiler (kişiye özel geçmiş)
export interface MediumReading {
  mediumId: string;
  targetId: string;
  targetName: string;
  team: Team;
  day: number;
}

// Moderatör Tur Raporu — her gece/infaz için detaylar. Gece mekaniğinin gizli
// bilgilerini (vampir hedefi, doktor koruması/kurtarışı, medyum sonucu) içerir;
// YALNIZCA moderatör görür (participantView'a dahil edilmez).
export interface RoundDeath {
  name: string;
  role: string; // gerçek rol adı (moderatör god-view)
  team: Team;
}
export interface RoundEvent {
  day: number;
  kind: "night" | "hang" | "hunter";
  at: number;
  vampTarget?: string | null; // vampirlerin seçtiği hedef
  doctorTarget?: string | null; // doktorun koruduğu kişi
  saved?: boolean; // doktor saldırıyı engelledi mi
  survivorShielded?: boolean; // hedef, kalkanını açan bir Survivor'dı (saldırı boşa gitti)
  mediumTarget?: string | null; // medyumun incelediği kişi
  mediumResult?: Team | null; // inceleme sonucu (vampir/köy)
  deaths: RoundDeath[]; // bu turda ölenler
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
  name: string; // oda adı (moderatör düzenler; boşsa kod gösterilir)
  password: string | null; // katılım şifresi (null = şifresiz)
  status: GameStatus;
  mode: GameMode;
  assignMode: AssignMode; // rol dağıtımı rastgele mi moderatör mü seçiyor
  phase: Phase;
  dayNumber: number;
  // El başlatma anı (sunucu saati). Başlangıç geri sayımı bu damgaya bağlanır:
  // telefonlar durumu yoklamayla farklı anlarda öğrense de sayım hepsinde AYNI
  // anda biter. Oyun başlamadıysa null.
  startedAt: number | null;
  roles: RoleConfig[];
  loversEnabled: boolean; // Âşıklar özelliği açık mı (oyun başında 2 kişi âşık olur)
  lovers: [string, string] | null; // âşık olan iki oyuncunun id'leri (yoksa null)
  players: Player[];
  vote: VoteState;
  night: NightState;
  mediumLog: MediumReading[];
  doctorSelfUsed: string[]; // kendini koruma hakkını kullanan doktor id'leri (oyun boyu 1 kez)
  survivorShieldsUsed: Record<string, number>; // her Survivor'ın harcadığı kalkan sayısı (oyun boyu, en fazla 2)
  announcement: Announcement | null;
  pendingHunterId: string | null; // asılan avcı, atış hakkı bekliyor
  hangedThisDay: boolean; // bu gündüz birisi asıldı mı (yeni geceye geçiş şartı)
  winner: Winner | null;
  log: { text: string; at: number }[];
  roundLog: RoundEvent[]; // moderatör tur raporu (gece/infaz detayları)
  version: number; // her değişimde artar (SSE değişiklik tespiti)
  updatedAt: number;
}

// Oda listeleme (mevcut oyunlar sayfası) — şifre asla dahil edilmez, yalnızca var/yok.
export interface RoomSummary {
  code: string;
  name: string;
  status: GameStatus;
  phase: Phase;
  mode: GameMode;
  playerCount: number;
  hasPassword: boolean;
  updatedAt: number;
}

// Kayıtlı oturum: istemcinin localStorage'ında duran (oda + kimlik) kaydının
// sunucudaki güncel karşılığı. Ana sayfadaki "devam eden odalarım" kartı bunu
// kullanır. Oda kapanmışsa yanıtta hiç yer almaz → istemci kaydı siler.
export interface SessionSummary extends RoomSummary {
  exists: boolean; // bu playerId hâlâ odanın oyuncu listesinde mi
  playerName: string | null; // odadaki adı (yoksa null)
  alive: boolean; // oyunda hâlâ hayatta mı (bilgi amaçlı)
}

/* ============================================================
   Hesaplar — ad + şifre. Kayıt tamamen isteğe bağlıdır: ziyaretçi de oynar,
   sadece ismi bu cihazda kısa süre hatırlanır. Hesabı olan her cihazdan aynı
   kimlikle girer ve maç geçmişi birikir.
   ============================================================ */

export interface UserDoc {
  _id: string; // rastgele kimlik (oyunlarda Player.userId olarak geçer)
  key: string; // benzersizlik anahtarı — adın normalize (katlanmış) hâli
  name: string; // görünen ad, kullanıcının yazdığı hâliyle
  passwordHash: string; // scrypt; şifrenin kendisi ASLA saklanmaz
  createdAt: number;
  lastSeenAt: number;
}

// Oturum kaydı. Çerezdeki ham jeton değil, onun sha256'sı saklanır: veritabanı
// sızsa bile jetonlar kullanılamaz.
export interface SessionDoc {
  _id: string; // sha256(token)
  userId: string;
  createdAt: number;
  expiresAt: Date; // TTL indeksi bu alanı kullanır
}

// İstemciye dönen güvenli hesap özeti (hash/jeton içermez).
export interface AccountView {
  id: string;
  name: string;
  createdAt: number;
}

/* ------------------------- Maç geçmişi -------------------------
   Odalar 1 saat sonra silindiği için oyun bitince geriye hiçbir şey kalmıyordu.
   Maç kaydı roller DAĞITILDIĞI ANDA açılır, sonuç belli olunca güncellenir —
   böylece yarıda bırakılan (özellikle sözlü) oyunlar da "roller dağıtıldı ama
   sonuç girilmedi" olarak kayda geçer. */

export interface MatchPlayer {
  userId: string | null; // ziyaretçi ise null
  name: string;
  roleKey: string | null;
  roleName: string | null;
  team: Team | null;
  special?: SpecialKey;
  alive: boolean; // maç bittiğinde hayatta mıydı
  won: boolean | null; // sonuç bilinmiyorsa null
  lover: boolean; // âşık çiftten biri miydi
}

export interface MatchRecord {
  _id: string; // `${oda kodu}:${startedAt}` — aynı el iki kez yazılmaz
  code: string;
  roomName: string;
  mode: GameMode; // "verbal" ise sonuç güvenilmez olabilir (bkz. finished)
  assignMode: AssignMode;
  startedAt: number;
  endedAt: number | null;
  // Oyun uygulama üzerinden sonuca bağlandı mı. false ise sözlü modda masada
  // bitmiş ya da moderatör odayı öylece bırakmıştır — roller yine de geçerli.
  finished: boolean;
  winner: Winner | null;
  dayCount: number;
  playerCount: number;
  loversEnabled: boolean;
  userIds: string[]; // "benim maçlarım" sorgusu için indekslenir
  players: MatchPlayer[];
  rounds: RoundEvent[]; // geceler, ölümler, infazlar
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
  // Yalnızca vampirler: her hedefin aldığı vampir oyu sayısı (aday butonlarında rozet)
  teamPicks?: { id: string; name: string; count: number }[];
  // Yalnızca vampirler: her takım arkadaşının o anki seçimi (canlı, tek tek)
  mates?: { id: string; name: string; targetName: string | null }[];
}

export interface ParticipantSelf {
  id: string;
  name: string;
  role: RoleConfig | null;
  alive: boolean;
  teammates: { id: string; name: string }[]; // vampirler için diğer vampirler
  readings: { targetName: string; team: Team; day: number }[]; // medyum için
  survivorShieldsLeft?: number | null; // Survivor için kalan kalkan hakkı
  loverName?: string | null; // âşıksa partnerinin adı (rolü DEĞİL, yalnızca isim)
}

export interface ParticipantView {
  role: "participant";
  forPlayerId: string | null; // bu görünüm hangi playerId için üretildi (stale veri ayrımı)
  exists: boolean; // oyuncu hâlâ oyunda mı (kick/reset tespiti)
  roomName: string; // oda adı (boşsa istemci kodu gösterir)
  hasPassword: boolean; // katılım şifre gerektiriyor mu (şifrenin kendisi sızdırılmaz)
  status: GameStatus;
  mode: GameMode;
  phase: Phase;
  dayNumber: number;
  startedAt: number | null; // el başlatma anı — başlangıç geri sayımı için
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
  winner: Winner | null;
  // Oyun bitince âşık çiftin isimleri (herkese açılır); yoksa null
  loverPair: { a: string; b: string } | null;
  // Oyun bitince tüm roller açığa çıkar
  reveal:
    | {
        id: string;
        name: string;
        roleName: string | null;
        roleKey: string | null;
        team: Team | null;
        special?: SpecialKey;
        alive: boolean;
      }[]
    | null;
  version: number;
}
