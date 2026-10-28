/**
 * A one-core scheduler simulation in whole milliseconds. Switching from one
 * job to another costs 1 ms. Three programs share the core: a long
 * compile, a video player that needs a little time every 20 ms, and one
 * key press that wants a quick response.
 */

export type Algorithm = "fcfs" | "sjf" | "rr";
export type Policy = { algorithm: Algorithm; quantum: number };
export const QUANTA = [2, 5, 10, 30] as const;
export const SWITCH_COST = 1;

export type Job = { id: string; program: "compile" | "video" | "keyboard"; arrive: number; burst: number; deadline: number };

export const JOBS: Job[] = [
  { id: "compile", program: "compile", arrive: 0, burst: 60, deadline: 130 },
  ...[0, 20, 40, 60, 80].map((arrive, index) => ({ id: `video-${index + 1}`, program: "video" as const, arrive, burst: 4, deadline: arrive + 20 })),
  { id: "keyboard", program: "keyboard", arrive: 33, burst: 2, deadline: 43 },
];

export type Segment = { start: number; end: number; job: string | null; kind: "run" | "switch" | "idle" };

export type Schedule = { segments: Segment[]; finish: Record<string, number>; switchTime: number; end: number };

export function simulate(policy: Policy): Schedule {
  const remaining = new Map(JOBS.map((job) => [job.id, job.burst]));
  const pending = [...JOBS].sort((a, b) => a.arrive - b.arrive);
  const queue: string[] = [];
  const finish: Record<string, number> = {};
  const segments: Segment[] = [];
  let time = 0;
  let last: string | null = null;
  let switchTime = 0;
  const admit = (until: number) => {
    while (pending.length && pending[0]!.arrive <= until) queue.push(pending.shift()!.id);
  };
  const push = (segment: Segment) => {
    const previous = segments[segments.length - 1];
    if (previous && previous.kind === segment.kind && previous.job === segment.job && previous.end === segment.start) previous.end = segment.end;
    else segments.push(segment);
  };
  admit(0);
  while (Object.keys(finish).length < JOBS.length && time < 1000) {
    if (!queue.length) {
      const next = pending[0]!.arrive;
      push({ start: time, end: next, job: null, kind: "idle" });
      time = next;
      admit(time);
      continue;
    }
    let index = 0;
    if (policy.algorithm === "sjf") index = queue.reduce((best, id, position) => (remaining.get(id)! < remaining.get(queue[best]!)! ? position : best), 0);
    const id = queue.splice(index, 1)[0]!;
    if (last !== null && last !== id) {
      push({ start: time, end: time + SWITCH_COST, job: id, kind: "switch" });
      time += SWITCH_COST;
      switchTime += SWITCH_COST;
      admit(time);
    }
    const slice = policy.algorithm === "rr" ? Math.min(policy.quantum, remaining.get(id)!) : remaining.get(id)!;
    push({ start: time, end: time + slice, job: id, kind: "run" });
    time += slice;
    remaining.set(id, remaining.get(id)! - slice);
    admit(time);
    if (remaining.get(id) === 0) finish[id] = time;
    else queue.push(id);
    last = id;
  }
  return { segments, finish, switchTime, end: time };
}

export type ScheduleGoal = { id: string; label: string; ok: boolean; detail: string };

export function evaluateSchedule(policy: Policy) {
  const schedule = simulate(policy);
  const videos = JOBS.filter((job) => job.program === "video");
  const late = videos.filter((job) => schedule.finish[job.id]! > job.deadline);
  const key = JOBS.find((job) => job.program === "keyboard")!;
  const keyDelay = schedule.finish[key.id]! - key.arrive;
  const compile = schedule.finish.compile!;
  const overhead = schedule.end ? schedule.switchTime / schedule.end : 0;
  const goals: ScheduleGoal[] = [
    { id: "keyboard", label: "按下键盘后 10 毫秒内有反应", ok: keyDelay <= 10, detail: `用了 ${keyDelay} 毫秒` },
    { id: "video", label: "视频每一帧都在下一帧之前画完（不卡）", ok: late.length === 0, detail: late.length ? `${late.length} 帧晚了` : "5 帧都按时" },
    { id: "compile", label: "编译在 130 毫秒内完成", ok: compile <= 130, detail: `第 ${compile} 毫秒完成` },
    { id: "overhead", label: "切换花掉的时间不超过总时间的 15%", ok: overhead <= 0.15, detail: `切换 ${schedule.switchTime} 毫秒，占 ${Math.round(overhead * 100)}%` },
  ];
  return { schedule, goals, passed: goals.every((goal) => goal.ok) };
}
