/* Vampir Köylü — oyun motoru regresyon testleri.
   Saf (DB'siz) fonksiyonları gerçek senaryolarla sürer. `npm test` */
import {
  makeFreshGame, defaultRoles, assignRolesFor, assignLovers, loverPartnerId,
  beginNight, resolveNight, submitNightAction, resolveVote, hangPlayer, hunterShoot,
  checkWinner, finalizeWinner, computeNightOrder, participantView, roleTeam,
  leaveGame, uniqueName, MAX_NAME_LEN, SURVIVOR_SHIELDS, randomRoomName,
} from "@/lib/game";
import type { Game } from "@/lib/types";

let passed = 0, failed = 0;
const fails: string[] = [];
function check(name: string, cond: unknown, extra?: unknown) {
  if (cond) { passed++; }
  else { failed++; fails.push(name); console.log(`  ✗ ${name}${extra !== undefined ? "  →  " + JSON.stringify(extra) : ""}`); }
}
function section(t: string) { console.log("\n" + t); }

// Belirli rollerle in-progress bir oyun kurar. role null olabilir (lobi senaryosu).
function mkGame(defs: { name: string; role: string | null }[], opts?: Partial<Game>): Game {
  const g = makeFreshGame("100000");
  g.roles = defaultRoles();
  g.mode = "phone";
  g.status = "in_progress";
  g.dayNumber = 1;
  g.players = defs.map((d, i) => ({ id: "p" + i, name: d.name, userId: null, role: d.role, alive: true, joinedAt: i }));
  Object.assign(g, opts);
  return g;
}
const idByName = (g: Game, n: string) => g.players.find((p) => p.name === n)!.id;
const alive = (g: Game, n: string) => g.players.find((p) => p.name === n)!.alive;

// Gece çözümünü doğrudan kurar (submitNightAction'ı atlar).
function nightResolveWith(g: Game, vampTarget: string | null, opts?: { doctor?: string; shields?: string[] }) {
  g.phase = "night";
  g.night = {
    active: true, order: [], step: 0,
    vampireVotes: vampTarget ? { pv: vampTarget } : {},
    doctorTarget: opts?.doctor ?? null, mediumTarget: null,
    survivorShields: opts?.shields ?? [], survivorDecided: [],
  };
  resolveNight(g);
}

// ---------------------------------------------------------------------------
section("1) Yapılandırma");
{
  const roles = defaultRoles();
  const keys = roles.map((r) => r.key);
  check("defaultRoles temel rolleri içerir", ["vampir", "doktor", "medyum", "avci", "soytari", "survivor", "koylu"].every((k) => keys.includes(k)));
  check("koylu fill rolü", !!roles.find((r) => r.key === "koylu")?.fill);
  check("survivor special işaretli", roles.find((r) => r.key === "survivor")?.special === "survivor");
  const nm = randomRoomName();
  check("randomRoomName boş değil", typeof nm === "string" && nm.length > 0, nm);
}

section("2) Rastgele rol dağıtımı");
{
  const g = makeFreshGame("100000");
  g.roles = defaultRoles().map((r) =>
    r.key === "vampir" ? { ...r, count: 2 } : r.key === "doktor" ? { ...r, count: 1 } : r
  );
  g.players = Array.from({ length: 6 }, (_, i) => ({ id: "p" + i, name: "P" + i, userId: null, role: null, alive: true, joinedAt: i }));
  const res = assignRolesFor(g);
  check("assign ok", res.ok, res);
  check("herkese rol atandı", g.players.every((p) => p.role));
  check("tam 2 vampir", g.players.filter((p) => roleTeam(g, p.role) === "vampir").length === 2);
  check("tam 1 doktor", g.players.filter((p) => p.role === "doktor").length === 1);
}

section("3) Gece: vampir öldürür (doktor yok)");
{
  const g = mkGame([
    { name: "V1", role: "vampir" }, { name: "V2", role: "vampir" },
    { name: "K1", role: "koylu" }, { name: "K2", role: "koylu" }, { name: "K3", role: "koylu" },
  ]);
  nightResolveWith(g, idByName(g, "K1"));
  check("K1 öldü", !alive(g, "K1"));
  check("sabah duyurusu", g.announcement?.kind === "morning");
  check("faz gündüz", g.phase === "day");
}

section("4) Doktor korur");
{
  const g = mkGame([
    { name: "V1", role: "vampir" }, { name: "D", role: "doktor" }, { name: "K1", role: "koylu" }, { name: "K2", role: "koylu" },
  ]);
  nightResolveWith(g, idByName(g, "K1"), { doctor: idByName(g, "K1") });
  check("K1 kurtuldu", alive(g, "K1"));
  check("duyuruda kimse ölmedi", g.announcement!.lines.some((l) => l.includes("Kimse ölmedi") || l.includes("kimse ölmedi")));
}

section("5) Doktor kendini bir kez korur (tam akış)");
{
  const g = mkGame([
    { name: "V1", role: "vampir" }, { name: "V2", role: "vampir" }, { name: "D", role: "doktor" }, { name: "K1", role: "koylu" },
  ]);
  beginNight(g);
  const D = idByName(g, "D");
  // vampirler önce oynar
  submitNightAction(g, idByName(g, "V1"), "vampir", idByName(g, "K1"));
  submitNightAction(g, idByName(g, "V2"), "vampir", idByName(g, "K1"));
  const r1 = submitNightAction(g, D, "doktor", D);
  check("doktor kendini korudu (1. kez ok)", r1.ok, r1);
  // 2. gece
  beginNight(g);
  submitNightAction(g, idByName(g, "V1"), "vampir", idByName(g, "K1"));
  submitNightAction(g, idByName(g, "V2"), "vampir", idByName(g, "K1"));
  const r2 = submitNightAction(g, D, "doktor", D);
  check("doktor kendini 2. kez koruyamaz", !r2.ok, r2);
}

section("6) Survivor kalkanı");
{
  // Sıra iddiasını gerçekten ölçebilmek için dört gece rolü de masada olmalı.
  const g = mkGame([
    { name: "V1", role: "vampir" }, { name: "D", role: "doktor" }, { name: "M", role: "medyum" },
    { name: "S", role: "survivor" }, { name: "K1", role: "koylu" },
  ]);
  const order = computeNightOrder(g);
  check("gece sırası survivor içerir", order.includes("survivor"));
  check("sıra: vampir<doktor<medyum<survivor", order.join(">") === "vampir>doktor>medyum>survivor", order);
  // Survivor kalkan açar, vampirler survivor'ı hedefler → survivor yaşar
  nightResolveWith(g, idByName(g, "S"), { shields: [idByName(g, "S")] });
  check("kalkanlı survivor yaşar", alive(g, "S"));

  // 2 kalkan biter → 3. gece sırada olmaz
  const g2 = mkGame([{ name: "V1", role: "vampir" }, { name: "S", role: "survivor" }, { name: "K1", role: "koylu" }, { name: "K2", role: "koylu" }]);
  g2.survivorShieldsUsed = { [idByName(g2, "S")]: SURVIVOR_SHIELDS };
  check("kalkanı biten survivor gece sırasında yok", !computeNightOrder(g2).includes("survivor"));
}

section("7) Medyum okuması");
{
  const g = mkGame([{ name: "V1", role: "vampir" }, { name: "M", role: "medyum" }, { name: "K1", role: "koylu" }, { name: "K2", role: "koylu" }]);
  beginNight(g);
  submitNightAction(g, idByName(g, "V1"), "vampir", idByName(g, "K1"));
  submitNightAction(g, idByName(g, "M"), "medyum", idByName(g, "V1"));
  const pv = participantView(g, idByName(g, "M"));
  check("medyum vampiri vampir okur", pv.self?.readings.some((r) => r.team === "vampir"));
}

section("8) Oylama / asma");
{
  const g = mkGame([{ name: "V1", role: "vampir" }, { name: "K1", role: "koylu" }, { name: "K2", role: "koylu" }, { name: "K3", role: "koylu" }]);
  g.vote = { active: true, votes: { a: idByName(g, "V1"), b: idByName(g, "V1"), c: idByName(g, "K1") } };
  const r = resolveVote(g);
  check("çoğunluk asıldı (V1)", r.hangedId === idByName(g, "V1") && !alive(g, "V1"));

  const g2 = mkGame([{ name: "A", role: "koylu" }, { name: "B", role: "koylu" }, { name: "V", role: "vampir" }]);
  g2.vote = { active: true, votes: { a: idByName(g2, "A"), b: idByName(g2, "B") } };
  const r2 = resolveVote(g2);
  check("beraberlikte kimse asılmaz", r2.hangedId === null);
}

section("9) Soytarı astırılınca kazanır");
{
  const g = mkGame([{ name: "SOY", role: "soytari" }, { name: "V", role: "vampir" }, { name: "K", role: "koylu" }, { name: "K2", role: "koylu" }]);
  g.vote = { active: true, votes: { a: idByName(g, "SOY"), b: idByName(g, "SOY"), c: idByName(g, "SOY") } };
  resolveVote(g);
  check("winner soytari", g.winner === "soytari");
  check("oyun bitti", g.status === "ended");
}

section("10) Avcı asılınca ateş eder");
{
  const g = mkGame([{ name: "AV", role: "avci" }, { name: "V", role: "vampir" }, { name: "K", role: "koylu" }, { name: "K2", role: "koylu" }]);
  g.vote = { active: true, votes: { a: idByName(g, "AV"), b: idByName(g, "AV"), c: idByName(g, "AV") } };
  resolveVote(g);
  check("avcı atış hakkı bekliyor", g.pendingHunterId === idByName(g, "AV"));
  hunterShoot(g, idByName(g, "V"));
  check("avcı vampiri vurdu", !alive(g, "V"));
  check("pendingHunter temizlendi", g.pendingHunterId === null);
}

section("11) Kazanma tespiti");
{
  const gk = mkGame([{ name: "K1", role: "koylu" }, { name: "K2", role: "koylu" }]);
  check("vampir yoksa köy kazanır", checkWinner(gk) === "koy");
  const gv = mkGame([{ name: "V1", role: "vampir" }, { name: "K1", role: "koylu" }]);
  check("vampir>=köylü → vampir kazanır", checkWinner(gv) === "vampir");
  const gc = mkGame([{ name: "V1", role: "vampir" }, { name: "K1", role: "koylu" }, { name: "K2", role: "koylu" }]);
  check("çoğunluk köyde → sonuç yok", checkWinner(gc) === null);
}

section("12) Âşıklar — seçim tarafsızları hariç tutar");
{
  let ok = true;
  for (let i = 0; i < 300; i++) {
    const g = mkGame([
      { name: "V", role: "vampir" }, { name: "D", role: "doktor" }, { name: "SOY", role: "soytari" },
      { name: "SUR", role: "survivor" }, { name: "K1", role: "koylu" }, { name: "K2", role: "koylu" },
    ], { loversEnabled: true });
    assignLovers(g);
    if (!g.lovers) { ok = false; break; }
    const names = g.lovers.map((id) => g.players.find((p) => p.id === id)!.name);
    if (names.includes("SOY") || names.includes("SUR")) { ok = false; break; }
    if (loverPartnerId(g, g.lovers[0]) !== g.lovers[1]) { ok = false; break; }
  }
  check("300 denemede âşıklar hep Köy/Vampir, tarafsız asla", ok);

  const gOff = mkGame([{ name: "V", role: "vampir" }, { name: "K", role: "koylu" }], { loversEnabled: false });
  assignLovers(gOff);
  check("kapalıyken âşık oluşmaz", gOff.lovers === null);
}

section("13) Ölüm bağı — gece");
{
  const g = mkGame([{ name: "V1", role: "vampir" }, { name: "V2", role: "vampir" }, { name: "A", role: "koylu" }, { name: "B", role: "koylu" }, { name: "C", role: "koylu" }],
    { loversEnabled: true });
  g.lovers = [idByName(g, "A"), idByName(g, "B")];
  nightResolveWith(g, idByName(g, "A"));
  check("gece: âşık A öldü", !alive(g, "A"));
  check("gece: partner B kahrından öldü", !alive(g, "B"));
  check("bağlı olmayan C yaşıyor", alive(g, "C"));
}

section("14) Ölüm bağı — asma");
{
  const g = mkGame([{ name: "A", role: "koylu" }, { name: "B", role: "vampir" }, { name: "C", role: "koylu" }, { name: "D", role: "koylu" }],
    { loversEnabled: true });
  g.lovers = [idByName(g, "A"), idByName(g, "B")]; // zıt takım âşıklar
  g.vote = { active: true, votes: { x: idByName(g, "A"), y: idByName(g, "A"), z: idByName(g, "A") } };
  resolveVote(g);
  check("asma: âşık A öldü", !alive(g, "A"));
  check("asma: partner B (vampir) kahrından öldü", !alive(g, "B"));
}

section("15) Ölüm bağı — avcı kurşunu");
{
  const g = mkGame([{ name: "AV", role: "avci" }, { name: "X", role: "koylu" }, { name: "Y", role: "koylu" }, { name: "V", role: "vampir" }, { name: "V2", role: "vampir" }],
    { loversEnabled: true });
  g.lovers = [idByName(g, "X"), idByName(g, "Y")];
  g.pendingHunterId = idByName(g, "AV");
  hunterShoot(g, idByName(g, "X"));
  check("avcı X'i vurdu", !alive(g, "X"));
  check("partner Y kahrından öldü", !alive(g, "Y"));
}

section("16) Âşıklar kazanmayı değiştirmez");
{
  const g = mkGame([{ name: "V", role: "vampir" }, { name: "K", role: "koylu" }], { loversEnabled: true });
  g.lovers = [idByName(g, "V"), idByName(g, "K")];
  check("zıt âşık son 2 → yine vampir kazanır", checkWinner(g) === "vampir");
}

section("17) participantView — âşık ismi & çift");
{
  const g = mkGame([{ name: "A", role: "koylu" }, { name: "B", role: "doktor" }, { name: "V", role: "vampir" }, { name: "K", role: "koylu" }],
    { loversEnabled: true });
  g.lovers = [idByName(g, "A"), idByName(g, "B")];
  const pv = participantView(g, idByName(g, "A"));
  check("A, partneri B'nin adını görür", pv.self?.loverName === "B");
  check("oyun sürerken loverPair gizli", pv.loverPair === null);
  g.status = "ended";
  const pvEnd = participantView(g, idByName(g, "A"));
  check("bitişte loverPair açılır", !!pvEnd.loverPair && [pvEnd.loverPair.a, pvEnd.loverPair.b].sort().join() === ["A", "B"].sort().join());
}

section("18) participantView — oda adı & şifre bayrağı");
{
  const g = mkGame([{ name: "K", role: "koylu" }, { name: "V", role: "vampir" }], { name: "Kıymetlim", password: "1234" });
  const pv = participantView(g, idByName(g, "K"));
  check("roomName geçer", pv.roomName === "Kıymetlim");
  check("hasPassword true (şifre sızmaz)", pv.hasPassword === true && !("password" in (pv as object)));
}

section("19) Tam el — köy kazanır (gece + asma zinciri)");
{
  const g = mkGame([{ name: "V", role: "vampir" }, { name: "K1", role: "koylu" }, { name: "K2", role: "koylu" }, { name: "K3", role: "koylu" }]);
  beginNight(g);
  submitNightAction(g, idByName(g, "V"), "vampir", idByName(g, "K1"));
  check("gece K1 öldü", !alive(g, "K1"));
  // gündüz: köy vampiri asar
  g.vote = { active: true, votes: { a: idByName(g, "V"), b: idByName(g, "V"), c: idByName(g, "V") } };
  resolveVote(g);
  finalizeWinner(g);
  check("vampir asıldı → köy kazandı", g.winner === "koy" && g.status === "ended");
}

section("20) Elle asma (sözlü mod) oylamayla aynı kuralları uygular");
{
  // Soytarı: moderatör astığında da tek başına kazanır
  const gs = mkGame([{ name: "SOY", role: "soytari" }, { name: "V", role: "vampir" }, { name: "K", role: "koylu" }, { name: "K2", role: "koylu" }]);
  hangPlayer(gs, idByName(gs, "SOY"));
  check("elle asma: soytarı kazandı", gs.winner === "soytari" && gs.status === "ended");

  // Avcı: elle asılınca da atış hakkı doğar
  const ga = mkGame([{ name: "AV", role: "avci" }, { name: "V", role: "vampir" }, { name: "K", role: "koylu" }, { name: "K2", role: "koylu" }]);
  hangPlayer(ga, idByName(ga, "AV"));
  check("elle asma: avcı atış bekliyor", ga.pendingHunterId === idByName(ga, "AV"));
  check("elle asma: gündüz asma işaretlendi", ga.hangedThisDay === true);
  check("elle asma: rol maskeli duyurulur", ga.announcement?.dead?.roleName === "Köylü");

  // Âşık bağı elle asmada da işler
  const gl = mkGame([{ name: "A", role: "koylu" }, { name: "B", role: "koylu" }, { name: "V", role: "vampir" }, { name: "V2", role: "vampir" }],
    { loversEnabled: true });
  gl.lovers = [idByName(gl, "A"), idByName(gl, "B")];
  hangPlayer(gl, idByName(gl, "A"));
  check("elle asma: âşık partneri de öldü", !alive(gl, "B"));

  // Zaten ölü hedef asılamaz
  const gd = mkGame([{ name: "X", role: "koylu" }, { name: "V", role: "vampir" }, { name: "K", role: "koylu" }, { name: "K2", role: "koylu" }]);
  gd.players.find((p) => p.name === "X")!.alive = false;
  check("ölü oyuncu tekrar asılamaz", hangPlayer(gd, idByName(gd, "X")) === null);
}

section("21) Biten oyunda kazanan yeniden hesaplanmaz");
{
  const g = mkGame([{ name: "V", role: "vampir" }, { name: "K1", role: "koylu" }, { name: "K2", role: "koylu" }]);
  g.vote = { active: true, votes: { a: idByName(g, "V"), b: idByName(g, "V") } };
  resolveVote(g);
  check("vampir asıldı → köy kazandı", g.winner === "koy" && g.status === "ended");
  // Moderatör bitmiş oyunda vampiri diriltirse ilan edilen sonuç değişmemeli
  g.players.find((p) => p.name === "V")!.alive = true;
  finalizeWinner(g);
  check("dirilme ilan edilmiş sonucu bozmaz", g.winner === "koy" && g.status === "ended");
}

section("22) Odadan ayrılma");
{
  // Lobide gerçekten listeden düşer — yoksa "hayalet oyuncu" rol alır.
  const g = mkGame([{ name: "A", role: null }, { name: "B", role: null }], { status: "lobby" });
  const res = leaveGame(g, idByName(g, "A"));
  check("lobide ayrılma ok", res.ok, res);
  check("oyuncu listeden silindi", !g.players.some((p) => p.name === "A"));
  check("diğer oyuncu kalır", g.players.length === 1);

  // Süren elde silinmez: rol dengesi ve kazanma hesabı bozulmasın.
  const gp = mkGame([{ name: "V", role: "vampir" }, { name: "K1", role: "koylu" }, { name: "K2", role: "koylu" }]);
  const resP = leaveGame(gp, idByName(gp, "V"));
  check("süren elde ayrılma reddedilir", !resP.ok, resP);
  check("oyuncu listede kalır", gp.players.length === 3);

  // Bilinmeyen kimlik hata değil (istemci yerel kaydını silsin yeter).
  check("bilinmeyen oyuncu sorunsuz", leaveGame(gp, "yok-boyle-biri").ok);
}

section("23) İsim çakışmasında otomatik sonek");
{
  const g = mkGame([{ name: "Emir", role: null }], { status: "lobby" });
  check("boş isim olduğu gibi kalır", uniqueName(g, "Deniz") === "Deniz");
  check("dolu isme (2) eklenir", uniqueName(g, "Emir") === "Emir (2)", uniqueName(g, "Emir"));

  // Büyük/küçük harf farkı da çakışma sayılır (katılım kontrolüyle aynı kural).
  check("büyük/küçük harf çakışması", uniqueName(g, "emir") === "emir (2)", uniqueName(g, "emir"));

  // Sonek de doluysa sıradaki numaraya geçer.
  g.players.push({ id: "x", name: "Emir (2)", userId: null, role: null, alive: true, joinedAt: 1 });
  check("sonek doluysa (3)", uniqueName(g, "Emir") === "Emir (3)", uniqueName(g, "Emir"));

  // Sonek isim sınırını taşırmamalı — gövde kısaltılır.
  const uzun = "A".repeat(MAX_NAME_LEN);
  const gl = mkGame([{ name: uzun, role: null }], { status: "lobby" });
  const soneklı = uniqueName(gl, uzun)!;
  check("uzun isim sınırı aşmaz", soneklı.length <= MAX_NAME_LEN, { soneklı, len: soneklı.length });
  check("uzun isim (2) ile biter", soneklı.endsWith(" (2)"), soneklı);

  // 99 varyantın hepsi doluysa null döner (çağıran taraf hata mesajı verir).
  const gf = mkGame([{ name: "X", role: null }], { status: "lobby" });
  for (let n = 2; n <= 99; n++) {
    gf.players.push({ id: "f" + n, name: `X (${n})`, userId: null, role: null, alive: true, joinedAt: n });
  }
  check("tükenince null", uniqueName(gf, "X") === null, uniqueName(gf, "X"));
}

// ---------------------------------------------------------------------------
console.log(`\n${"=".repeat(40)}\nSonuç: ${passed} geçti, ${failed} başarısız`);
if (failed) { console.log("Başarısızlar:", fails.join(" | ")); process.exit(1); }
console.log("✅ Tüm motor testleri geçti.");
