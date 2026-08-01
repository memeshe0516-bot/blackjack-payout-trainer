import { useEffect, useMemo, useRef, useState } from "react";

type Mode = "beginner" | "intermediate" | "advanced" | "exam" | "weak";
type Screen = "home" | "game" | "records" | "help" | "examResult";
type Counts = Record<number, number>;
type Problem = { amount: number; chips: Counts; id: string };
type Attempt = {
  id: string; date: string; mode: Mode; amount: number; problemChips: Counts;
  answerChips: Counts; correct: boolean; minimal: boolean; mistakes: number;
  seconds: number; revealed: boolean; skipped: boolean; timedOut?: boolean;
};
type WeakItem = { key: string; amount: number; chips: Counts; misses: number; streak: number };
type ExamRow = { problem: Problem; answer: Counts; correct: boolean; minimal: boolean; seconds: number; timedOut?: boolean };

const DENOMS = [1, 4, 20, 100, 400] as const;
const DESC = [400, 100, 20, 4, 1] as const;
const EMPTY = (): Counts => ({ 1: 0, 4: 0, 20: 0, 100: 0, 400: 0 });
const META: Record<number, { label: string; short: string; cls: string; group: number }> = {
  1: { label: "25¢", short: "25¢", cls: "quarter", group: 4 },
  4: { label: "$1", short: "$1", cls: "one", group: 5 },
  20: { label: "$5", short: "$5", cls: "five", group: 5 },
  100: { label: "$25", short: "$25", cls: "twentyfive", group: 4 },
  400: { label: "$100", short: "$100", cls: "hundred", group: 1 },
};
const MODE_NAMES: Record<Mode, string> = { beginner: "初級", intermediate: "中級", advanced: "上級", exam: "試験", weak: "苦手問題" };

function total(c: Counts) { return DENOMS.reduce((s, d) => s + d * (c[d] || 0), 0); }
function count(c: Counts) { return DENOMS.reduce((s, d) => s + (c[d] || 0), 0); }
function minimal(units: number) {
  const c = EMPTY(); let left = units;
  for (const d of DESC) { c[d] = Math.floor(left / d); left %= d; }
  return c;
}
function sameCounts(a: Counts, b: Counts) { return DENOMS.every(d => (a[d] || 0) === (b[d] || 0)); }
function keyFor(amount: number, c: Counts) { return `${amount}:${DESC.map(d => c[d] || 0).join("-")}`; }
function money(units: number) { return `$${(units / 4).toFixed(units % 4 ? 2 : 0)}`; }
function randomInt(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function randomComposition(amount: number) {
  const c = minimal(amount * 4);
  const roll = Math.random();
  const target = roll < .3 ? randomInt(count(c), Math.min(9, 20)) : roll < .8 ? randomInt(Math.min(7, 20), 14) : randomInt(15, 20);
  const splits = [
    { from: 400, to: 100, n: 4 }, { from: 100, to: 20, n: 5 }, { from: 20, to: 4, n: 5 },
  ];
  let guard = 0;
  while (count(c) < target && guard++ < 100) {
    const possible = splits.filter(s => c[s.from] > 0 && count(c) + s.n - 1 <= 20);
    if (!possible.length) break;
    const s = possible[randomInt(0, possible.length - 1)];
    c[s.from]--; c[s.to] += s.n;
  }
  return c;
}

function makeProblem(mode: Mode, weak: WeakItem[]): Problem {
  if (mode === "weak" && weak.length) {
    const pool = weak.filter(w => w.streak < 3);
    const usable = pool.length ? pool : weak;
    const weighted = usable.flatMap(w => Array(Math.min(6, Math.max(1, w.misses))).fill(w));
    const w = weighted[randomInt(0, weighted.length - 1)];
    return { amount: w.amount, chips: { ...w.chips }, id: `${Date.now()}-${Math.random()}` };
  }
  const max = mode === "beginner" ? 100 : 500;
  const amount = randomInt(5, max);
  const chips = (mode === "advanced" || mode === "exam") ? randomComposition(amount) : minimal(amount * 4);
  chips[1] = 0;
  return { amount, chips, id: `${Date.now()}-${Math.random()}` };
}

function Chip({ denom, hidden = false, onClick, small = false, ariaLabel }: { denom: number; hidden?: boolean; onClick?: () => void; small?: boolean; ariaLabel?: string }) {
  return <button type="button" className={`chip ${META[denom].cls} ${small ? "small" : ""} ${onClick ? "clickable" : ""}`} onClick={onClick} aria-label={ariaLabel || (hidden ? "問題チップ" : `${META[denom].label}チップ`)}>
    <span className="chip-inset"><span>{hidden ? "♠" : META[denom].short}</span></span>
  </button>;
}

function ProblemPile({ chips, compact = false }: { chips: Counts; compact?: boolean }) {
  const groups: { denom: number; qty: number; base: number; bundleIndex: number; offset: number }[] = [];
  let base = 0;
  let coloredBundleIndex = 0;
  for (const d of DESC) {
    let left = chips[d] || 0;
    let bundleIndex = 0;
    while (left > 0) {
      const qty = Math.min(META[d].group, left);
      // $100 (black) forms the centered base. Above it, the bundle sequence
      // continues across denomination changes: right, left, right, left...
      const offset = d === 400 ? 0 : coloredBundleIndex % 2 === 0 ? 18 : -18;
      groups.push({ denom: d, qty, base, bundleIndex, offset });
      if (d !== 400) coloredBundleIndex++;
      base += qty; left -= qty; bundleIndex++;
    }
  }
  return <div className={`problem-pile ${compact ? "compact" : ""}`} aria-label={`問題チップ ${count(chips)}枚`}>
    <div className="pile-run" style={{ "--total": base, "--bundles": groups.length } as React.CSSProperties}>{groups.map((g, gi) => <div className="pile-group" style={{ "--g": gi, "--base": g.base, "--block-shift": g.offset } as React.CSSProperties} data-denom={g.denom} data-bundle={g.bundleIndex + 1} key={`${g.denom}-${gi}`}>
      {Array(g.qty).fill(0).map((_, i) => <span className={`side-chip ${META[g.denom].cls}`} style={{ "--i": i, "--shift": 0 } as React.CSSProperties} aria-hidden="true" key={i} />)}
    </div>)}</div>
  </div>;
}

function GroupedRow({ denom, qty, remove }: { denom: number; qty: number; remove?: () => void }) {
  return <div className="answer-row">
    <span className="row-label">{META[denom].label}</span>
    <div className="answer-groups">{Array(qty).fill(0).map((_, i) => <Chip denom={denom} small onClick={remove} ariaLabel={`${META[denom].label}を1枚削除`} key={i} />)}</div>
  </div>;
}

function Modal({ children, actions }: { children: React.ReactNode; actions: React.ReactNode }) {
  return <div className="modal-backdrop"><div className="modal" role="dialog" aria-modal="true"><div className="modal-mark">♠</div><div className="modal-copy">{children}</div><div className="modal-actions">{actions}</div></div></div>;
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("home");
  const [mode, setMode] = useState<Mode>("beginner");
  const [problem, setProblem] = useState<Problem | null>(null);
  const [answer, setAnswer] = useState<Counts>(EMPTY());
  const [elapsed, setElapsed] = useState(0);
  const [examLeft, setExamLeft] = useState(90);
  const [examIndex, setExamIndex] = useState(0);
  const [examRows, setExamRows] = useState<ExamRow[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [weak, setWeak] = useState<WeakItem[]>([]);
  const [mistakes, setMistakes] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [modal, setModal] = useState<null | { type: string; title?: string }>(null);
  const startedAt = useRef(Date.now());
  const finalized = useRef(false);

  useEffect(() => {
    try {
      setAttempts(JSON.parse(localStorage.getItem("bj-attempts") || "[]"));
      setWeak(JSON.parse(localStorage.getItem("bj-weak") || "[]"));
    } catch { /* ignore damaged local data */ }
  }, []);
  useEffect(() => { if (attempts.length) localStorage.setItem("bj-attempts", JSON.stringify(attempts.slice(-500))); }, [attempts]);
  useEffect(() => { localStorage.setItem("bj-weak", JSON.stringify(weak)); }, [weak]);

  useEffect(() => {
    if (screen !== "game") return;
    const timer = window.setInterval(() => {
      if (mode === "exam") setExamLeft(v => Math.max(0, v - 1));
      else setElapsed(Math.floor((Date.now() - startedAt.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [screen, mode]);

  useEffect(() => {
    if (screen === "game" && mode === "exam" && examLeft === 0 && !finalized.current) finishExamTimeout();
  }, [examLeft, screen, mode]);

  function start(m: Mode) {
    if (m === "weak" && weak.filter(w => w.streak < 3).length === 0) { setModal({ type: "noWeak" }); return; }
    finalized.current = false; setMode(m); setAnswer(EMPTY()); setMistakes(0); setConfirmed(false); setRevealed(false); setElapsed(0);
    setExamLeft(90); setExamIndex(0); setExamRows([]); startedAt.current = Date.now(); setProblem(makeProblem(m, weak)); setScreen("game");
  }
  function nextProblem() {
    setProblem(makeProblem(mode, weak)); setAnswer(EMPTY()); setMistakes(0); setConfirmed(false); setRevealed(false); setElapsed(0); startedAt.current = Date.now(); setModal(null);
  }
  function add(d: number) { setAnswer(a => ({ ...a, [d]: (a[d] || 0) + 1 })); }
  function remove(d: number) { setAnswer(a => ({ ...a, [d]: Math.max(0, (a[d] || 0) - 1) })); }

  function registerWeak(p: Problem, correct = false) {
    const key = keyFor(p.amount, p.chips);
    setWeak(list => {
      const found = list.find(w => w.key === key);
      if (!found) return correct ? list : [...list, { key, amount: p.amount, chips: p.chips, misses: 1, streak: 0 }];
      return list.map(w => w.key === key ? { ...w, misses: correct ? w.misses : w.misses + 1, streak: correct ? w.streak + 1 : 0 } : w);
    });
  }
  function saveAttempt(correct: boolean, minimalOk: boolean, opts: { revealed?: boolean; skipped?: boolean; timedOut?: boolean } = {}) {
    if (!problem) return;
    const row: Attempt = { id: `${Date.now()}-${Math.random()}`, date: new Date().toISOString(), mode, amount: problem.amount, problemChips: problem.chips, answerChips: answer, correct, minimal: minimalOk, mistakes, seconds: mode === "exam" ? 90 - examLeft : elapsed, revealed: !!opts.revealed, skipped: !!opts.skipped, timedOut: opts.timedOut };
    setAttempts(a => [...a, row]);
    if ((!correct || opts.revealed || opts.skipped || opts.timedOut) && mistakes === 0) registerWeak(problem, false);
    else if (correct && mistakes === 0 && mode === "weak") registerWeak(problem, true);
  }

  function confirmAnswer() {
    if (!problem) return;
    setConfirmed(true);
    const wanted = problem.amount * 6; // amount dollars × 4 units × 1.5
    const amountOk = total(answer) === wanted;
    const min = minimal(wanted); const minOk = sameCounts(answer, min);
    if (mode === "exam") {
      const row = { problem, answer: { ...answer }, correct: amountOk, minimal: minOk, seconds: 90 - examLeft };
      setExamRows(r => [...r, row]);
      saveAttempt(amountOk, minOk);
      if (examIndex >= 2) { finalized.current = true; setScreen("examResult"); }
      else { setExamIndex(i => i + 1); setProblem(makeProblem("exam", weak)); setAnswer(EMPTY()); startedAt.current = Date.now(); }
      return;
    }
    if (!amountOk) { setMistakes(m => m + 1); registerWeak(problem, false); setModal({ type: "wrong" }); }
    else {
      saveAttempt(true, minOk); setModal({ type: minOk ? "correct" : "correctNonMinimal" });
    }
  }

  function revealAnswer() { if (!problem) return; setAnswer(minimal(problem.amount * 6)); setRevealed(true); saveAttempt(false, false, { revealed: true }); setModal(null); }
  function skipNow() { saveAttempt(false, false, { skipped: true }); nextProblem(); }
  function requestNext() {
    if (!confirmed) { setModal({ type: "skip" }); return; }
    if (mistakes > 0 && !revealed && total(answer) !== (problem?.amount || 0) * 6) saveAttempt(false, false, { skipped: true });
    nextProblem();
  }
  function finishExamTimeout() {
    finalized.current = true;
    if (problem) {
      const row: ExamRow = { problem, answer: { ...answer }, correct: false, minimal: false, seconds: 90, timedOut: true };
      setExamRows(r => [...r, row]); saveAttempt(false, false, { timedOut: true });
      for (let i = examIndex + 1; i < 3; i++) {
        const p = makeProblem("exam", weak);
        setExamRows(r => [...r, { problem: p, answer: EMPTY(), correct: false, minimal: false, seconds: 0, timedOut: true }]);
      }
    }
    setScreen("examResult");
  }
  function exitToHome() {
    if (mode === "exam" && problem) saveAttempt(false, false, { timedOut: true });
    setModal(null); setScreen("home");
  }

  const stats = useMemo(() => {
    const totalN = attempts.length, correctN = attempts.filter(a => a.correct).length, minimalN = attempts.filter(a => a.correct && a.minimal).length;
    const timed = attempts.filter(a => a.correct); const avg = timed.length ? timed.reduce((s, a) => s + a.seconds, 0) / timed.length : 0;
    return { totalN, correctN, minimalN, avg };
  }, [attempts]);

  if (screen === "home") return <main className="app-shell home-screen">
    <section className="brand"><div className="brand-suit">♠</div><p>BLACKJACK PAYOUT TRAINER</p><h1><span>3：2</span> 配当トレーニング</h1><p className="lead">チップを見て、考えて、正しく配当する。</p></section>
    <section className="mode-grid">
      <button className="mode-card beginner" onClick={() => start("beginner")}><span className="mode-icon">♣</span><b>初級モード</b><small>5〜100ドル・最小枚数</small></button>
      <button className="mode-card intermediate" onClick={() => start("intermediate")}><span className="mode-icon">♦</span><b>中級モード</b><small>5〜500ドル・最小枚数</small></button>
      <button className="mode-card advanced" onClick={() => start("advanced")}><span className="mode-icon">♠</span><b>上級モード</b><small>5〜500ドル・ランダム構成</small></button>
      <button className="mode-card exam" onClick={() => start("exam")}><span className="mode-icon">★</span><b>試験モード</b><small>3問・90秒</small></button>
    </section>
    <section className="sub-actions">
      <button onClick={() => start("weak")}><span>↻</span>苦手問題<small>{weak.filter(w => w.streak < 3).length}問</small></button>
      <button onClick={() => setScreen("records")}><span>▥</span>記録を見る</button>
      <button onClick={() => setScreen("help")}><span>?</span>遊び方・チップ説明</button>
    </section>
    <footer>BLACKJACK PAYS 3 TO 2</footer>
    {modal?.type === "noWeak" && <Modal actions={<button className="gold-btn" onClick={() => setModal(null)}>OK</button>}><h3>苦手問題はまだありません</h3><p>間違えた問題やスキップした問題が、ここに登録されます。</p></Modal>}
  </main>;

  if (screen === "records") return <main className="app-shell info-screen"><TopBar title="記録" back={() => setScreen("home")} />
    <section className="stats-grid"><div><small>正答率</small><b>{stats.totalN ? Math.round(stats.correctN / stats.totalN * 100) : 0}%</b><span>{stats.correctN} / {stats.totalN}問</span></div><div><small>最小枚数正答率</small><b>{stats.totalN ? Math.round(stats.minimalN / stats.totalN * 100) : 0}%</b><span>{stats.minimalN}問</span></div><div><small>平均回答時間</small><b>{stats.avg.toFixed(1)}秒</b><span>正解した問題</span></div></section>
    <section className="record-list"><h2>最近の記録</h2>{attempts.length === 0 ? <p className="empty-copy">まだ記録がありません。</p> : attempts.slice().reverse().slice(0, 20).map(a => <article key={a.id}><span className={a.correct ? "good" : "bad"}>{a.correct ? "正解" : "不正解"}</span><div><b>{MODE_NAMES[a.mode]} ・ ベット ${a.amount}</b><small>{new Date(a.date).toLocaleString("ja-JP")} ／ {a.seconds}秒{a.correct && !a.minimal ? " ／ 金額のみ正解" : ""}</small></div></article>)}</section>
  </main>;

  if (screen === "help") return <main className="app-shell info-screen"><TopBar title="遊び方・チップ説明" back={() => setScreen("home")} />
    <section className="help-card"><h2>配当のしかた</h2><p>問題のチップだけを見てベット額を読み取り、1.5倍の配当をラックから選びます。元のベットは配当に含めません。</p><div className="formula"><span>ベット</span><b>× 1.5</b><span>＝ 配当</span></div></section>
    <section className="help-card"><h2>チップの額面</h2><div className="chip-guide">{DENOMS.map(d => <div key={d}><Chip denom={d} /><b>{META[d].label}</b></div>)}</div><p className="note">問題チップには額面が表示されません。色と枚数で判断しましょう。奇数ドルの配当には25セントチップが2枚必要です。</p></section>
  </main>;

  if (screen === "examResult") {
    const right = examRows.filter(r => r.correct).length;
    return <main className="app-shell info-screen"><TopBar title="試験結果" back={() => setScreen("home")} /><section className="result-hero"><span>RESULT</span><b>{right} / 3</b><p>正答率 {Math.round(right / 3 * 100)}%</p></section><section className="exam-list">{examRows.slice(0, 3).map((r, i) => <article key={i}><header><b>第{i + 1}問</b><span className={r.correct ? "good" : "bad"}>{r.correct ? "正解" : r.timedOut ? "時間切れ" : "不正解"}</span></header><ProblemPile chips={r.problem.chips} compact /><div className="result-detail"><p>ベット額 <b>${r.problem.amount}</b></p><p>回答 <b>{money(total(r.answer))}</b></p><p>正解 <b>{money(r.problem.amount * 6)}</b></p><p>時間 <b>{r.seconds}秒</b></p></div><div className="correct-chips"><span>最小枚数の配当</span>{DESC.filter(d => minimal(r.problem.amount * 6)[d]).map(d => <span key={d}>{META[d].label}×{minimal(r.problem.amount * 6)[d]}</span>)}</div></article>)}</section><button className="wide-gold" onClick={() => start("exam")}>もう一度挑戦</button></main>;
  }

  if (!problem) return null;
  return <main className="app-shell game-screen">
    <header className="game-header"><button aria-label="ホームへ戻る" onClick={() => setModal({ type: "home" })}>⌂</button><div><span>{MODE_NAMES[mode]}</span>{mode === "exam" ? <b>{examIndex + 1} / 3　残り {String(Math.floor(examLeft / 60)).padStart(2, "0")}:{String(examLeft % 60).padStart(2, "0")}</b> : <b>{String(Math.floor(elapsed / 60)).padStart(2, "0")}:{String(elapsed % 60).padStart(2, "0")}</b>}</div></header>
    <section className="problem-zone"><p>このベットを配当してください</p><ProblemPile chips={problem.chips} /></section>
    <section className="answer-zone"><header><h2>配当エリア</h2><span>{count(answer)} CHIPS</span></header><div className="answer-lines">{DENOMS.map(d => <GroupedRow denom={d} qty={answer[d] || 0} remove={answer[d] ? () => remove(d) : undefined} key={d} />)}</div></section>
    <section className="rack"><p>チップをタップして追加</p><div>{DENOMS.map(d => <Chip denom={d} onClick={() => add(d)} key={d} />)}</div></section>
    <section className="game-actions"><button className="confirm" onClick={confirmAnswer}>配当確定</button><button onClick={() => setAnswer(EMPTY())}>全削除</button>{mode !== "exam" && <><button disabled={mistakes === 0 || revealed} onClick={() => setModal({ type: "reveal" })}>答えを見る</button><button onClick={requestNext}>次の問題</button></>}</section>
    {modal?.type === "wrong" && <Modal actions={<button className="gold-btn" onClick={() => setModal(null)}>もう一度考える</button>}><h3>配当が違います</h3><p>チップを追加・削除して、もう一度考えてみましょう。</p></Modal>}
    {modal?.type === "correct" && <Modal actions={<button className="gold-btn" onClick={nextProblem}>次の問題へ</button>}><h3>正解！</h3><p>最小枚数で配当できました。</p></Modal>}
    {modal?.type === "correctNonMinimal" && <Modal actions={<><button onClick={() => setModal(null)}>見直す</button><button className="gold-btn" onClick={nextProblem}>次の問題へ</button></>}><h3>正解。</h3><p>ただし、もっと少ないチップで配当できます。</p></Modal>}
    {modal?.type === "reveal" && <Modal actions={<><button onClick={() => setModal(null)}>問題に戻る</button><button className="gold-btn" onClick={revealAnswer}>表示する</button></>}><h3>正解のチップ構成を表示しますか？</h3><p>この問題は不正解として記録されます。</p></Modal>}
    {modal?.type === "skip" && <Modal actions={<><button onClick={() => setModal(null)}>問題に戻る</button><button className="gold-btn" onClick={skipNow}>次へ進む</button></>}><h3>この問題を飛ばして<br />次へ進みますか？</h3></Modal>}
    {modal?.type === "home" && <Modal actions={<><button onClick={() => setModal(null)}>練習を続ける</button><button className="gold-btn" onClick={exitToHome}>{mode === "exam" ? "試験を終了" : "ホームへ戻る"}</button></>}><h3>{mode === "exam" ? "試験を終了しますか？" : "練習を終了してホーム画面に戻りますか？"}</h3>{mode === "exam" && <p>現在の結果は途中終了として記録されます。</p>}</Modal>}
  </main>;
}

function TopBar({ title, back }: { title: string; back: () => void }) {
  return <header className="top-bar"><button onClick={back} aria-label="ホームへ戻る">‹</button><h1>{title}</h1><span>♠</span></header>;
}
