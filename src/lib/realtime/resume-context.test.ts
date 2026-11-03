import assert from "node:assert/strict";
import { test } from "node:test";
import { buildResumeItems, resumeNotice, type ResumeTurn } from "./resume-context";

const turns: ResumeTurn[] = [
  { role: "interviewer", text: "안녕하세요. 자기소개 부탁드립니다.", interrupted: false },
  { role: "candidate", text: "네, 저는…", interrupted: false },
  { role: "interviewer", text: "", interrupted: false },
  { role: "interviewer", text: "지원동기는 무엇인가요?", interrupted: true },
];

type Item = { type: string; item: { role: string; content: { type: string; text: string }[] } };

test("턴은 역할에 맞는 메시지 항목이 되고 마지막에 재개 안내가 붙는다", () => {
  const items = buildResumeItems(turns, { questionIndex: 0, questionCount: 3, pausedForMs: 90_000 }) as Item[];
  assert.equal(items.length, 4); // 빈 텍스트 제외 3개 + 안내
  assert.ok(items.every((i) => i.type === "conversation.item.create"));
  assert.deepEqual(
    items.slice(0, 3).map((i) => [i.item.role, i.item.content[0].type]),
    [
      ["assistant", "output_text"],
      ["user", "input_text"],
      ["assistant", "output_text"],
    ],
  );
  const notice = items[3].item;
  assert.equal(notice.role, "system");
  assert.match(notice.content[0].text, /약 2분/);
  assert.match(notice.content[0].text, /1번까지 시작/);
  assert.match(notice.content[0].text, /끊겼으니/);
});

test("글자 수를 넘기면 오래된 턴부터 빼고 생략 안내를 앞에 둔다", () => {
  const long: ResumeTurn[] = Array.from({ length: 5 }, (_, i) => ({
    role: i % 2 ? "candidate" : "interviewer",
    text: `${i}`.repeat(100),
    interrupted: false,
  }));
  const items = buildResumeItems(long, { questionIndex: null, questionCount: 0, pausedForMs: 0, maxChars: 250 }) as Item[];
  assert.equal(items[0].item.role, "system");
  assert.match(items[0].item.content[0].text, /3개는 생략/);
  assert.equal(items.length, 1 + 2 + 1);
  assert.equal(items[1].item.content[0].text[0], "3");
});

test("재개 안내는 단계에 따라 문구가 달라진다", () => {
  const intro = resumeNotice([turns[0], turns[1]], { questionIndex: null, questionCount: 3, pausedForMs: 10_000 });
  assert.match(intro, /인사·자기소개 단계/);
  assert.match(intro, /이어서 답하게/);
  assert.doesNotMatch(intro, /끊겼으니/);
  const noList = resumeNotice([], { questionIndex: null, questionCount: 0, pausedForMs: 10_000 });
  assert.doesNotMatch(noList, /질문 목록/);
});
