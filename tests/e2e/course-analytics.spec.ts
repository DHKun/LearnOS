import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import {
  api,
  createTestCourse,
  createTestStudent,
  deleteTestCourse,
  deleteTestStudent,
  getCourseBySlug,
  getLessons,
  login,
  query,
  queryOne,
  rpc,
  type TestStudent,
} from "./helpers";

const ADMIN = { email: "admin@learnos.local", password: "LearnOS-Admin-2025!" };

async function insertLesson(
  courseId: string,
  slug: string,
  position: number,
  blocks: { id: string; kind: "simulation" | "question"; title: string }[],
) {
  const config = {
    blocks,
    completion: { mode: "all", requiredBlocks: blocks.map((block) => block.id) },
  };
  const row = await queryOne<{ id: string }>(
    `insert into public.lessons (course_id, slug, title, position, type, required, content_ref, completion_policy, config)
     values ($1, $2, $3, $4, 'article', true, $5, 'server_validated', $6) returning id`,
    [courseId, slug, `卡点章节 ${position + 1}`, position, `lessons/${slug}.mdx`, JSON.stringify(config)],
  );
  return row!.id;
}

async function attempt(
  student: TestStudent,
  enrollmentId: string,
  lessonId: string,
  blockId: string,
  kind: "simulation" | "question",
  passed: boolean,
  feedback: Record<string, unknown> = {},
) {
  await rpc("save_block_result", {
    p_student: student.id,
    p_enrollment: enrollmentId,
    p_lesson: lessonId,
    p_block_id: blockId,
    p_block_kind: kind,
    p_attempt_id: randomUUID(),
    p_request_hash: randomUUID(),
    p_passed: passed,
    p_score: passed ? 100 : 0,
    p_feedback: feedback,
  });
}

test.describe("课程卡点分析", () => {
  test("按章节、练习和题目汇总学习记录，学生无法访问", async ({ browser }) => {
    const course = await createTestCourse("analytics");
    const fast = await createTestStudent("analytics-fast");
    const slow = await createTestStudent("analytics-slow");
    const adminContext = await browser.newContext();
    const studentContext = await browser.newContext();

    try {
      const lab = await insertLesson(course.id, "lab", 0, [
        { id: "lab", kind: "simulation", title: "修好那条请求" },
      ]);
      const quiz = await insertLesson(course.id, "quiz", 1, [
        { id: "check", kind: "question", title: "章末检查" },
      ]);
      const enroll = async (student: TestStudent) =>
        (await queryOne<{ id: string }>(
          `insert into public.enrollments (student_id, course_id) values ($1, $2) returning id`,
          [student.id, course.id],
        ))!.id;
      const fastEnrollment = await enroll(fast);
      const slowEnrollment = await enroll(slow);
      await query(
        `insert into public.lesson_progress (enrollment_id, lesson_id, status)
         values ($1, $3, 'in_progress'), ($2, $3, 'in_progress'), ($1, $4, 'in_progress')`,
        [fastEnrollment, slowEnrollment, lab, quiz],
      );

      // fast：实验错两次后通过，章末检查第 1 题选错
      await attempt(fast, fastEnrollment, lab, "lab", "simulation", false);
      await attempt(fast, fastEnrollment, lab, "lab", "simulation", false);
      await attempt(fast, fastEnrollment, lab, "lab", "simulation", true);
      await attempt(fast, fastEnrollment, quiz, "check", "question", false, {
        results: [
          { questionId: "q1", correct: false, given: "a" },
          { questionId: "q2", correct: true },
        ],
      });
      // slow：实验错一次，还没通过
      await attempt(slow, slowEnrollment, lab, "lab", "simulation", false);

      const adminPage = await adminContext.newPage();
      await login(adminPage, ADMIN.email, ADMIN.password);
      await adminPage.goto(`/admin/courses/${course.id}`);
      await adminPage.getByRole("link", { name: "卡点分析" }).click();
      await expect(adminPage).toHaveURL(new RegExp(`/admin/courses/${course.id}/analytics$`));
      await expect(adminPage.getByRole("heading", { name: "E2E analytics" })).toBeVisible();

      const first = adminPage.getByTestId("analytics-lesson-1");
      await expect(first.getByTestId("reached")).toHaveText("2");
      await expect(first.getByTestId("completed")).toHaveText("1");
      await expect(first.getByTestId("waiting")).toHaveText("1");
      const second = adminPage.getByTestId("analytics-lesson-2");
      await expect(second.getByTestId("reached")).toHaveText("1");
      await expect(second.getByTestId("completed")).toHaveText("0");
      await expect(second.getByTestId("waiting")).toHaveText("1");

      const labRow = adminPage.getByTestId("analytics-block-lab");
      await expect(labRow.getByTestId("learners")).toHaveText("2");
      await expect(labRow.getByTestId("passed")).toHaveText("1");
      await expect(labRow.getByTestId("stuck")).toHaveText("1");
      await expect(labRow.getByTestId("avg")).toHaveText("3");
      await expect(labRow.getByTestId("first-try")).toHaveText("0%");

      const question = adminPage.getByTestId("analytics-question-q1");
      await expect(question.getByTestId("wrong-rate")).toHaveText("100%");
      await expect(question.getByTestId("wrong-choice")).toHaveText(/选了「a」\s*1/);
      await expect(adminPage.getByTestId("analytics-question-q2")).toHaveCount(0);
      // 只有聚合数字，不出现学员姓名
      await expect(adminPage.getByText(fast.name)).toHaveCount(0);

      const studentPage = await studentContext.newPage();
      await login(studentPage, slow.email, slow.password);
      await studentPage.goto(`/admin/courses/${course.id}/analytics`);
      await expect(studentPage).not.toHaveURL(/\/analytics/);
    } finally {
      await adminContext.close();
      await studentContext.close();
      await deleteTestCourse(course.id);
      await deleteTestStudent(fast.id);
      await deleteTestStudent(slow.id);
    }
  });

  test("知识检查答错时记录所选选项，并在分析页显示选项文字", async ({ browser }) => {
    const course = await getCourseBySlug("http-hands-on");
    const response = (await getLessons(course.id)).find((lesson) => lesson.slug === "response")!;
    // 其余题答对，只让 r1 选错「状态码本身」
    const bank = JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), "content/courses/http-hands-on/assessments/response.server.json"),
        "utf8",
      ),
    ) as { questions: { id: string; answer: string | string[] | boolean }[] };
    const answers = Object.fromEntries(
      bank.questions.map((question) => [
        question.id,
        question.id === "r1"
          ? "a"
          : typeof question.answer === "boolean"
            ? String(question.answer)
            : question.answer,
      ]),
    );
    const student = await createTestStudent("analytics-choice");
    const studentContext = await browser.newContext();
    const adminContext = await browser.newContext();

    try {
      const studentPage = await studentContext.newPage();
      await login(studentPage, student.email, student.password);
      const join = await api<{ id: string }>(studentPage, "/api/enrollments", "POST", {
        courseId: course.id,
      });
      expect(join.status).toBe(200);

      const submit = await api<{ passed: boolean; feedback: { results: unknown[] } }>(
        studentPage,
        "/api/learning/blocks/submit",
        "POST",
        {
          attemptId: randomUUID(),
          enrollmentId: join.body!.data!.id,
          lessonId: response.id,
          blockId: "response-check",
          submission: { answers },
        },
      );
      expect(submit.status).toBe(200);
      const results = submit.body!.data!.feedback.results;
      expect(results[0]).toEqual({ questionId: "r1", correct: false, given: "a" });
      expect(results.slice(1).every((result) => !("given" in (result as object)))).toBe(true);

      const adminPage = await adminContext.newPage();
      await login(adminPage, ADMIN.email, ADMIN.password);
      await adminPage.goto(`/admin/courses/${course.id}/analytics`);
      await expect(
        adminPage.getByTestId("analytics-question-r1").getByTestId("wrong-choice").filter({
          hasText: "状态码本身",
        }),
      ).toBeVisible();
    } finally {
      await studentContext.close();
      await adminContext.close();
      await deleteTestStudent(student.id);
    }
  });
});
