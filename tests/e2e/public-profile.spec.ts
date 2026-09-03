import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const profilePath = "/@darren";
const conversationId = "11111111-1111-4111-8111-111111111111";
const primaryIdeaId = "22222222-2222-4222-8222-222222222222";
const secondaryIdeaId = "33333333-3333-4333-8333-333333333333";
const refinedIdeaId = "44444444-4444-4444-8444-444444444444";
const initialBusinessMessage =
  "I’m Taylor Reed from AcmeMonitor. AcmeMonitor helps AI teams monitor production reliability and safety.\n\nI’d like to explore: acmemonitor.com";

type TurnRequest = {
  action?: string;
  conversationId?: string;
  ideaId?: string;
  message?: string;
  history?: Array<{ role: string; content: string }>;
  ideaContext?: string;
};

type IntakeRequest = {
  action:
    | "save_profile"
    | "save_step"
    | "request_verification"
    | "resend_verification"
    | "verify_code";
  conversationId?: string;
  step?: "person_name" | "company_name" | "company_description";
  value?: string;
  personName?: string;
  companyName?: string;
  companyDescription?: string;
  initialIntent?: string;
  email?: string;
  password?: string;
  code?: string;
};

type AgentEvent = Record<string, unknown>;

const strongFitIdeas = [
  {
    id: primaryIdeaId,
    fitLabel: "Strong Fit",
    type: "Joint educational article",
    title: "How Observability Helps Teams Catch Risky AI Agent Behavior",
    description:
      "A practical educational piece connecting AI observability with reliability and AI safety.",
    whyItWorks:
      "Darren adds the AI-safety framing while the visitor contributes production monitoring expertise.",
    ownerContribution: "Editorial framing, audience context, and final quality judgment.",
    visitorContribution: "Technical examples, subject-matter expertise, and distribution.",
    mutualValue: "Both audiences get practical guidance for safer production AI systems.",
    activation: "Joint article and newsletter spotlight",
  },
  {
    id: secondaryIdeaId,
    fitLabel: "Good Fit",
    type: "Developer resource exchange",
    title: "A Curated Reliability Toolkit for Teams Shipping AI Agents",
    description: "A selective exchange of practical guides, checklists, and research.",
    whyItWorks: "The resources are independently useful to both technical communities.",
    ownerContribution: "Curation, editorial context, and audience relevance.",
    visitorContribution: "Monitoring guides and implementation examples.",
    mutualValue: "Builders receive a credible starting point for dependable agents.",
    activation: "Resource exchange widget",
  },
];

function strongFitEvents(): AgentEvent[] {
  return [
    { type: "conversation", conversationId },
    { type: "status", stage: "understand_business", state: "done" },
    { type: "status", stage: "compare_audiences", state: "active" },
    { type: "status", stage: "compare_audiences", state: "done" },
    { type: "status", stage: "find_angles", state: "active" },
    { type: "assistant_delta", delta: "I found two directions " },
    { type: "assistant_delta", delta: "that are genuinely worth exploring." },
    { type: "status", stage: "find_angles", state: "done" },
    { type: "status", stage: "assess_fit", state: "done" },
    {
      type: "fit",
      fit: {
        label: "Strong Fit",
        rationale:
          "Both sides serve technical audiences working on dependable AI systems.",
        strengths: ["Strong topical overlap"],
        concerns: ["Keep the execution educational rather than product-led."],
      },
    },
    { type: "ideas", ideas: strongFitIdeas },
    { type: "done", state: "IDEA_GENERATION" },
  ];
}

function noFitEvents(): AgentEvent[] {
  return [
    { type: "conversation", conversationId },
    { type: "status", stage: "understand_business", state: "done" },
    { type: "status", stage: "compare_audiences", state: "done" },
    { type: "status", stage: "find_angles", state: "done" },
    { type: "status", stage: "assess_fit", state: "done" },
    {
      type: "assistant_delta",
      delta: "I don’t see enough audience or values alignment to recommend an introduction.",
    },
    {
      type: "fit",
      fit: {
        label: "Not a Fit",
        rationale: "The audience and proposed value do not credibly overlap.",
        strengths: [],
        concerns: ["Low topical relevance", "High risk of feeling promotional"],
      },
    },
    { type: "ideas", ideas: [] },
    { type: "done", state: "NO_FIT" },
  ];
}

function exploredIdeaEvents(): AgentEvent[] {
  return [
    { type: "conversation", conversationId },
    { type: "status", stage: "understand_business", state: "done" },
    {
      type: "assistant_delta",
      delta: "The clearest first step is a 30-minute working session.",
    },
    {
      type: "fit",
      fit: {
        label: "Strong Fit",
        rationale: "The concept has a balanced division of work and a low-risk first step.",
        strengths: ["Clear contributions"],
        concerns: [],
      },
    },
    {
      type: "ideas",
      ideas: [
        {
          ...strongFitIdeas[0],
          id: refinedIdeaId,
          type: "Refined partnership brief",
          activation: "30-minute scoping session followed by a shared one-page brief",
        },
      ],
    },
    { type: "done", state: "PROPOSAL_READY" },
  ];
}

function unavailableEvents(): AgentEvent[] {
  return [
    { type: "conversation", conversationId },
    {
      type: "error",
      code: "service_unavailable",
      message: "The demo is temporarily unavailable. Please try again. Reference: TEST1234",
    },
  ];
}

async function mockTurnStream(
  page: Page,
  respond: (request: TurnRequest, callIndex: number) => AgentEvent[],
) {
  let callIndex = 0;
  await page.route("**/api/demo/turns", async (route) => {
    const request = route.request().postDataJSON() as TurnRequest;
    const events = respond(request, callIndex++);

    await route.fulfill({
      status: 200,
      contentType: "application/x-ndjson; charset=utf-8",
      headers: { "Cache-Control": "no-store, no-transform" },
      body: `${events.map((event) => JSON.stringify(event)).join("\n")}\n`,
    });
  });
}

async function mockIntake(
  page: Page,
  onRequest?: (request: IntakeRequest) => void,
) {
  const lead: Record<string, string | null> = {
    personName: null,
    companyName: null,
    companyDescription: null,
    initialIntent: null,
    intakeCompletedAt: null,
  };

  await page.route("**/api/public/profiles/darren/intake", async (route) => {
    const request = route.request().postDataJSON() as IntakeRequest;
    onRequest?.(request);
    if (
      request.action === "save_profile" &&
      request.personName &&
      request.companyName &&
      request.companyDescription
    ) {
      lead.personName = request.personName;
      lead.companyName = request.companyName;
      lead.companyDescription = request.companyDescription;
      lead.initialIntent ??= request.initialIntent ?? null;
      lead.intakeCompletedAt = "2026-09-03T00:00:00.000Z";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ conversationId, lead }),
      });
      return;
    }
    if (request.action === "save_step" && request.step && request.value) {
      const field = {
        person_name: "personName",
        company_name: "companyName",
        company_description: "companyDescription",
      }[request.step];
      lead[field] = request.value;
      lead.initialIntent ??= request.initialIntent ?? null;
      if (request.step === "company_description") {
        lead.intakeCompletedAt = "2026-09-03T00:00:00.000Z";
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ conversationId, lead }),
      });
      return;
    }
    if (request.action === "request_verification") {
      if (!request.password || request.password.length < 8) {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ error: "Create a password with at least 8 characters." }),
        });
        return;
      }
      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({ sent: true, email: "te••@example.com" }),
      });
      return;
    }
    if (request.action === "resend_verification") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ sent: true, email: "te••@example.com" }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ verified: true, email: request.email ?? "test@example.com" }),
    });
  });
  return lead;
}

async function completeVerifiedIntake(page: Page) {
  await page.getByPlaceholder("e.g. Taylor Reed").fill("Taylor Reed");
  await page.getByPlaceholder("e.g. AcmeMonitor").fill("AcmeMonitor");
  await page.getByPlaceholder("Describe it in one or two sentences.").fill(
    "AcmeMonitor helps AI teams monitor production reliability and safety.",
  );
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByPlaceholder("you@company.com").fill("test@example.com");
  await page.getByPlaceholder("At least 8 characters").fill("secure-password-123");
  await page.getByRole("button", { name: "Create account & send code" }).click();
  await page.getByPlaceholder("000000").fill("123456");
  await page.getByRole("button", { name: "Verify email" }).click();
  await expect(page.getByText("Email verified", { exact: true })).toBeVisible();
}

async function startStrongFitChat(page: Page) {
  await mockIntake(page);
  await page.goto(profilePath);
  await page.getByRole("textbox", { name: "Message PartnerBird" }).fill("acmemonitor.com");
  await page.getByRole("button", { name: "Send message" }).click();
  await completeVerifiedIntake(page);
  await page.getByRole("button", { name: "Continue to Agent Chat" }).click();
  await expect(page.getByTestId("idea-card")).toHaveCount(2);
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("renders the public lobby", async ({ page }) => {
  await page.goto(profilePath);

  await expect(page).toHaveTitle(/Darren’s PartnerBird/);
  await expect(page.getByRole("heading", { name: "Darren", exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Talk to Darren’s PartnerBird" }),
  ).toBeVisible();
  await expect(page.getByText("AI · Safety · SaaS · Creator")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start with PartnerBird" })).toBeVisible();
  const profileTheme = page.getByTestId("public-profile-theme");
  await expect(profileTheme).toHaveAttribute("data-accent", "forest");
  await expect(profileTheme).toHaveAttribute("data-theme-source", "preset");
  await expect(
    page.getByRole("link", { name: "PartnerBird WebMCP demo home" }).locator("[data-brand-mark]"),
  ).toBeVisible();
  expect(
    await profileTheme.evaluate((element) =>
      getComputedStyle(element).getPropertyValue("--profile-primary").trim(),
    ),
  ).toBe("#168D4A");
  expect(
    await page
      .getByRole("link", { name: "PartnerBird WebMCP demo home" })
      .locator("[data-brand-mark] > span")
      .evaluate((element) => getComputedStyle(element).backgroundColor),
  ).toBe("rgb(22, 141, 74)");
  await expect(
    page.getByRole("heading", { name: "Recent collaboration examples" }),
  ).toBeVisible();
  await expect(page.getByTestId("chat-transcript")).toHaveCount(0);
});

test("defaults to light mode and persists an explicit dark-mode choice", async ({
  page,
}) => {
  await page.goto(profilePath);

  const root = page.locator("html");
  const profileTheme = page.getByTestId("public-profile-theme");
  const birdGlyph = profileTheme.locator("[data-brand-mark] > span").first();
  const lightSurface = await profileTheme.evaluate(
    (element) => getComputedStyle(element).getPropertyValue("--canvas").trim(),
  );
  const initialPrimary = await profileTheme.evaluate((element) =>
    getComputedStyle(element).getPropertyValue("--profile-primary").trim(),
  );
  const initialBirdColor = await birdGlyph.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  await expect(root).toHaveAttribute("data-theme", "light");

  const darkModeToggle = page.getByRole("button", {
    name: "Switch to dark mode",
  });
  await expect(darkModeToggle).toHaveAttribute("aria-pressed", "false");
  await darkModeToggle.click();

  await expect(root).toHaveAttribute("data-theme", "dark");
  expect(
    await profileTheme.evaluate((element) =>
      getComputedStyle(element).getPropertyValue("--profile-primary").trim(),
    ),
  ).toBe(initialPrimary);
  expect(
    await birdGlyph.evaluate((element) => getComputedStyle(element).backgroundColor),
  ).toBe(initialBirdColor);
  expect(
    await profileTheme.evaluate((element) =>
      getComputedStyle(element).getPropertyValue("--canvas").trim(),
    ),
  ).not.toBe(lightSurface);
  await expect(
    page.getByRole("button", { name: "Switch to light mode" }),
  ).toHaveAttribute("aria-pressed", "true");

  await page.reload();
  await expect(root).toHaveAttribute("data-theme", "dark");
  expect(
    await page
      .getByTestId("public-profile-theme")
      .locator("[data-brand-mark] > span")
      .first()
      .evaluate((element) => getComputedStyle(element).backgroundColor),
  ).toBe(initialBirdColor);
  await expect(
    page.getByRole("button", { name: "Switch to light mode" }),
  ).toBeVisible();

  const accessibilityScan = await new AxeBuilder({ page }).analyze();
  const highImpactViolations = accessibilityScan.violations.filter(
    (violation) =>
      violation.impact === "serious" || violation.impact === "critical",
  );
  expect(highImpactViolations).toEqual([]);
});

test("moves from the lobby into the full chat", async ({ page }) => {
  let aiCalls = 0;
  await page.route("**/api/demo/turns", async (route) => {
    aiCalls += 1;
    await route.abort();
  });
  await page.goto(profilePath);

  await page.getByRole("button", { name: "Start with PartnerBird" }).click();

  await expect(page).toHaveURL(/\/\@darren\?chat=1$/);
  await expect(page.getByRole("region", { name: "PartnerBird conversation" })).toBeVisible();
  await expect(page.getByTestId("agent-intake-form")).toBeVisible();
  await expect(page.getByText("A quick introduction", { exact: true })).toBeVisible();
  await expect(page.getByTestId("chat-turn")).toHaveCount(0);
  await expect(page.getByText("WORTH EXPLORING", { exact: true })).toHaveCount(0);
  expect(aiCalls).toBe(0);
  await expect(
    page.getByRole("heading", { name: "Recent collaboration examples" }),
  ).toBeHidden();

  await expect(page.getByTestId("workspace-composer")).toHaveCount(0);
});

test("preserves intake and the selected starter intent across a reload", async ({ page }) => {
  const lead = await mockIntake(page);
  let aiCalls = 0;
  await page.route("**/api/demo/turns", async (route) => {
    aiCalls += 1;
    await route.abort();
  });
  await page.goto(profilePath);

  await page.getByRole("button", { name: "Suggest partnership ideas" }).click();
  await page.getByPlaceholder("e.g. Taylor Reed").fill("Taylor Reed");
  await page.getByPlaceholder("e.g. AcmeMonitor").fill("AcmeMonitor");
  await page
    .getByPlaceholder("Describe it in one or two sentences.")
    .fill("AcmeMonitor helps teams understand production AI reliability.");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  expect(lead.initialIntent).toBe("Suggest partnership ideas");

  await page.route(`**/api/public/conversations/${conversationId}/messages*`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        controlMode: "agent",
        state: "DISCOVERY",
        messages: [],
        agentMessages: [],
        fit: null,
        ideas: [],
        contact: null,
        lead,
        viewer: null,
      }),
    });
  });
  await page.reload();

  await expect(page.getByPlaceholder("you@company.com")).toBeVisible();
  await expect(page.getByText("Verify your email to continue", { exact: true })).toBeVisible();
  expect(aiCalls).toBe(0);
});

test("resends the inline email verification code", async ({ page }) => {
  const requests: IntakeRequest[] = [];
  await mockIntake(page, (request) => requests.push(request));
  await page.goto(profilePath);

  await page.getByRole("button", { name: "Start with PartnerBird" }).click();
  await page.getByPlaceholder("e.g. Taylor Reed").fill("Taylor Reed");
  await page.getByPlaceholder("e.g. AcmeMonitor").fill("AcmeMonitor");
  await page
    .getByPlaceholder("Describe it in one or two sentences.")
    .fill("AcmeMonitor helps teams understand production AI reliability.");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByPlaceholder("you@company.com").fill("test@example.com");
  await page.getByPlaceholder("At least 8 characters").fill("secure-password-123");
  await page.getByRole("button", { name: "Create account & send code" }).click();

  await page.getByRole("button", { name: "Resend code" }).click();

  await expect(
    page.getByText("A new verification code was sent. Check your inbox and spam folder."),
  ).toBeVisible();
  expect(requests.filter((request) => request.action === "resend_verification")).toHaveLength(1);
});

test("asks legacy contacts without an auth account to create one before showing the code step", async ({
  page,
}) => {
  await page.route(`**/api/public/conversations/${conversationId}/messages*`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        controlMode: "agent",
        state: "DISCOVERY",
        messages: [],
        agentMessages: [],
        fit: null,
        ideas: [],
        contact: {
          email: "legacy@example.com",
          verified: false,
          accountCreated: false,
        },
        lead: {
          personName: "Taylor Reed",
          companyName: "AcmeMonitor",
          companyDescription: "Monitoring for production AI teams.",
          initialIntent: null,
          intakeCompletedAt: "2026-09-03T00:00:00.000Z",
        },
        viewer: null,
      }),
    });
  });

  await page.goto(`${profilePath}?chat=1&conversation=${conversationId}`);

  await expect(page.getByPlaceholder("you@company.com")).toBeVisible();
  await expect(page.getByPlaceholder("At least 8 characters")).toBeVisible();
  await expect(page.getByPlaceholder("000000")).toHaveCount(0);
});

test("recovers from a stale saved conversation before submitting intake", async ({ page }) => {
  const staleConversationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const recoveredConversationId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  let submittedConversationId: string | undefined;

  await page.addInitScript((staleId) => {
    window.localStorage.setItem("partnerbird:v1:conversation:darren", staleId);
  }, staleConversationId);
  await page.route(
    `**/api/public/conversations/${staleConversationId}/messages*`,
    async (route) => route.fulfill({ status: 404, contentType: "application/json", body: "{}" }),
  );
  await page.route("**/api/public/profiles/darren/intake", async (route) => {
    const request = route.request().postDataJSON() as IntakeRequest;
    submittedConversationId = request.conversationId;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        conversationId: recoveredConversationId,
        lead: {
          personName: request.personName,
          companyName: request.companyName,
          companyDescription: request.companyDescription,
          initialIntent: request.initialIntent,
          intakeCompletedAt: "2026-09-03T00:00:00.000Z",
        },
      }),
    });
  });

  await page.goto(`${profilePath}?chat=1&conversation=${staleConversationId}`);
  await page.getByPlaceholder("e.g. Taylor Reed").fill("Dan");
  await page.getByPlaceholder("e.g. AcmeMonitor").fill("PromptStep");
  await page
    .getByPlaceholder("Describe it in one or two sentences.")
    .fill("A Chrome extension for saving and organizing reusable prompts.");
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  expect(submittedConversationId).toBeUndefined();
  await expect(page.getByPlaceholder("you@company.com")).toBeVisible();
  await expect(page.getByText("Conversation not found.")).toHaveCount(0);
  await expect(page).toHaveURL(
    new RegExp(`conversation=${recoveredConversationId}$`),
  );
});

test("settles into the chat layout before revealing the conversation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(profilePath);

  await page.getByRole("button", { name: "Start with PartnerBird" }).click();

  const transition = page.getByTestId("chat-transition");
  await expect(page).toHaveURL(/\/\@darren\?chat=1$/);
  await expect(transition).toBeVisible();
  await expect(transition).toHaveAttribute("aria-busy", "true");
  await expect(page.getByRole("region", { name: "PartnerBird conversation" })).toHaveCount(0);

  await expect(transition).toBeHidden({ timeout: 2_000 });
  await expect(page.getByRole("region", { name: "PartnerBird conversation" })).toBeVisible();
  await expect(page.getByTestId("agent-intake-form")).toBeVisible();
  await expect(page.getByTestId("chat-turn")).toHaveCount(0);
});

test("does not call AI while revealing the initial intake", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  let aiCalls = 0;
  await page.route("**/api/demo/turns", async (route) => {
    aiCalls += 1;
    await route.abort();
  });
  await page.goto(profilePath);

  await page.getByRole("button", { name: "Start with PartnerBird" }).click();
  const transition = page.getByTestId("chat-transition");

  await expect(transition).toBeVisible();
  await page.waitForTimeout(900);
  await expect(transition).toBeHidden();
  await expect(page.getByRole("region", { name: "PartnerBird conversation" })).toBeVisible();
  await expect(page.getByTestId("agent-intake-form")).toBeVisible();
  await expect(page.getByTestId("idea-card")).toHaveCount(0);
  await expect(page.getByTestId("workspace-composer")).toHaveCount(0);
  expect(aiCalls).toBe(0);
});

test("does not reveal a delayed chat after returning to the lobby", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });

  await page.goto(profilePath);

  await page.getByRole("button", { name: "Start with PartnerBird" }).click();
  await expect(page.getByTestId("chat-transition")).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/\@darren$/);
  await expect(page.getByRole("button", { name: "Start with PartnerBird" })).toBeVisible();

  await page.waitForTimeout(900);
  await expect(page.getByTestId("chat-transition")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "PartnerBird conversation" })).toHaveCount(0);
});

test("renders streamed assistant text, a strong-fit assessment, and its ideas", async ({
  page,
}) => {
  await mockTurnStream(page, () => strongFitEvents());
  await startStrongFitChat(page);

  const turn = page.getByTestId("chat-turn").first();
  await expect(turn.getByTestId("assistant-message")).toHaveText(
    "I found two directions that are genuinely worth exploring.",
  );
  await expect(turn.getByTestId("fit-summary")).toContainText("STRONG FIT");
  await expect(turn.getByTestId("idea-card")).toHaveCount(2);
  await expect(turn.getByTestId("idea-card").first()).toContainText(
    strongFitIdeas[0].title,
  );
});

test("keeps short replies on one line and applies the selected chat text size", async ({
  page,
}) => {
  await mockTurnStream(page, () => strongFitEvents());
  await startStrongFitChat(page);

  const composer = page.getByRole("textbox", { name: "Message PartnerBird" });
  await composer.fill("sounds good");
  await page.getByRole("button", { name: "Send message" }).click();

  const reply = page.getByTestId("visitor-message").last();
  await expect(reply).toHaveText("sounds good");
  const lineMetrics = await reply.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      contentHeight:
        element.getBoundingClientRect().height -
        Number.parseFloat(style.paddingTop) -
        Number.parseFloat(style.paddingBottom),
      lineHeight: Number.parseFloat(style.lineHeight),
      fontSize: Number.parseFloat(style.fontSize),
    };
  });
  expect(lineMetrics.contentHeight).toBeLessThanOrEqual(lineMetrics.lineHeight * 1.1);

  const detailFontSize = await page
    .getByLabel("Analysis progress")
    .first()
    .locator(":scope > div")
    .first()
    .evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  expect(detailFontSize).toBe(lineMetrics.fontSize);

  await page.getByLabel("Chat text size").selectOption("large");
  await expect.poll(() => reply.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThan(lineMetrics.fontSize);
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("partnerbird:v1:chat-text-size"))).toBe("large");
});

test("adds no idea cards to a no-fit turn", async ({ page }) => {
  await mockTurnStream(page, (_request, callIndex) =>
    callIndex === 0 ? strongFitEvents() : noFitEvents(),
  );
  await startStrongFitChat(page);

  await page
    .getByRole("textbox", { name: "Message PartnerBird" })
    .fill("We operate a casino and want a mass backlink exchange.");
  await page.getByRole("button", { name: "Send message" }).click();

  const turns = page.getByTestId("chat-turn");
  await expect(turns).toHaveCount(2);
  await expect(turns.nth(1).getByTestId("fit-summary")).toContainText("NOT A FIT");
  await expect(turns.nth(1).getByTestId("idea-card")).toHaveCount(0);
  await expect(page.getByTestId("idea-card")).toHaveCount(2);
});

test("explores a selected idea in a new turn", async ({ page }) => {
  let exploreRequest: TurnRequest | undefined;
  await mockTurnStream(page, (request, callIndex) => {
    if (callIndex === 1) exploreRequest = request;
    return callIndex === 0 ? strongFitEvents() : exploredIdeaEvents();
  });
  await startStrongFitChat(page);

  await page.getByTestId("idea-card").first().getByRole("button", { name: "Explore idea" }).click();

  const turns = page.getByTestId("chat-turn");
  await expect(turns).toHaveCount(2);
  await expect(turns.nth(1).getByTestId("assistant-message")).toContainText(
    "30-minute working session",
  );
  await expect(turns.nth(1).getByTestId("idea-card")).toContainText(
    "Refined partnership brief",
  );
  expect(exploreRequest).toMatchObject({
    action: "explore_idea",
    conversationId,
    ideaId: primaryIdeaId,
  });
  expect(exploreRequest?.history).toEqual([
    { role: "visitor", content: initialBusinessMessage },
    {
      role: "assistant",
      content: "I found two directions that are genuinely worth exploring.",
    },
  ]);
  expect(exploreRequest?.ideaContext).toContain(strongFitIdeas[0].title);
});

test("retries a failed selected-idea turn with its original context", async ({ page }) => {
  const requests: TurnRequest[] = [];
  await mockTurnStream(page, (request, callIndex) => {
    requests.push(request);
    if (callIndex === 0) return strongFitEvents();
    if (callIndex === 1) return unavailableEvents();
    return exploredIdeaEvents();
  });
  await startStrongFitChat(page);

  await page
    .getByTestId("idea-card")
    .first()
    .getByRole("button", { name: "Explore idea" })
    .click();

  const failedTurn = page.getByTestId("chat-turn").nth(1);
  await expect(failedTurn.getByRole("alert")).toContainText("TEST1234");
  await failedTurn.getByRole("button", { name: "Try again" }).click();

  const retriedTurn = page.getByTestId("chat-turn").nth(2);
  await expect(retriedTurn.getByTestId("assistant-message")).toContainText(
    "30-minute working session",
  );
  expect(requests[2]).toMatchObject({
    action: "explore_idea",
    ideaId: primaryIdeaId,
  });
  expect(requests[2].ideaContext).toContain(strongFitIdeas[0].title);
  expect(requests[2].history).toEqual([
    { role: "visitor", content: initialBusinessMessage },
    {
      role: "assistant",
      content: "I found two directions that are genuinely worth exploring.",
    },
  ]);
});

test("sends both guided follow-up actions through the normal chat path", async ({ page }) => {
  const requests: TurnRequest[] = [];
  await mockTurnStream(page, (request) => {
    requests.push(request);
    return strongFitEvents();
  });
  await startStrongFitChat(page);

  await page.getByRole("button", { name: "Continue qualification" }).click();
  await expect(page.getByTestId("chat-turn")).toHaveCount(2);
  await page.getByRole("button", { name: "Tell me honestly" }).click();
  await expect(page.getByTestId("chat-turn")).toHaveCount(3);

  expect(requests[1]).toMatchObject({
    action: "message",
    message: "Ask me the most important qualification question.",
  });
  expect(requests[2]).toMatchObject({
    action: "message",
    message: "Be candid: is this actually a strong mutual fit?",
  });
});

test("a completed idea can be submitted and temporarily completes the chat", async ({ page }) => {
  let proposalRequests = 0;
  await mockTurnStream(page, () => strongFitEvents());
  await page.route("**/api/public/proposals", async (route) => {
    proposalRequests += 1;
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        proposalId: "77777777-7777-4777-8777-777777777777",
        status: "submitted",
        resumeEmailSent: true,
      }),
    });
  });
  await startStrongFitChat(page);

  const idea = page.getByTestId("idea-card").first();
  const submitButton = idea.getByRole("button", { name: "Submit with PartnerBird" });
  await expect(submitButton).toBeEnabled();
  await submitButton.click();
  await page.getByRole("button", { name: "Send to owner" }).click();

  const completion = page.getByTestId("proposal-completion");
  await expect(completion).toBeVisible();
  await expect(page.getByTestId("submission-confetti")).toBeVisible();
  await expect(completion).toContainText("Thank you — your partnership request is on its way.");
  await expect(completion).toContainText("private link to return to this conversation");
  await expect(page.getByRole("textbox", { name: "Message PartnerBird" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Continue qualification" })).toHaveCount(0);
  expect(proposalRequests).toBe(1);

  await page.route(`**/api/public/conversations/${conversationId}/messages*`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        controlMode: "agent",
        state: "PROPOSAL_SENT",
        messages: [],
        agentMessages: [
          {
            id: "visitor-1",
            role: "visitor",
            content: initialBusinessMessage,
            createdAt: "2026-09-03T00:00:00.000Z",
          },
          {
            id: "assistant-1",
            role: "assistant",
            content: "I found two directions that are genuinely worth exploring.",
            createdAt: "2026-09-03T00:00:01.000Z",
          },
        ],
        fit: {
          label: "Strong Fit",
          rationale: "Both sides serve technical audiences working on dependable AI systems.",
          strengths: ["Strong topical overlap"],
          concerns: [],
        },
        ideas: strongFitIdeas,
        contact: { email: "test@example.com", verified: true, accountCreated: true },
        lead: {
          personName: "Taylor Reed",
          companyName: "AcmeMonitor",
          companyDescription: "AcmeMonitor helps AI teams monitor production reliability and safety.",
          initialIntent: "acmemonitor.com",
          intakeCompletedAt: "2026-09-03T00:00:00.000Z",
        },
        viewer: { email: "test@example.com", verified: true, accountCreated: true },
      }),
    });
  });
  await page.reload();

  await expect(page.getByTestId("proposal-completion")).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Message PartnerBird" })).toBeEnabled();
});

test.describe("mobile chat", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("keeps a prominent chat CTA and the inline intake usable on mobile", async ({
    page,
  }) => {
    await mockTurnStream(page, () => strongFitEvents());
    await page.goto(profilePath);

    const startButton = page.getByRole("button", {
      name: "Talk to Darren’s PartnerBird",
    });
    await expect(startButton).toBeVisible();
    const startBox = await startButton.boundingBox();
    expect(startBox && startBox.y + startBox.height).toBeLessThanOrEqual(844);

    await startButton.click();
    await expect(page.getByTestId("chat-transcript")).toBeVisible();
    const intake = page.getByTestId("agent-intake-form");
    await expect(intake).toBeVisible();
    await expect(page.getByPlaceholder("e.g. Taylor Reed")).toBeVisible();
    await expect(page.getByTestId("workspace-composer")).toHaveCount(0);
  });

  test("puts profile context in an accessible mobile dialog", async ({ page }) => {
    await page.goto(`${profilePath}?chat=1`);
    const shellPrimary = await page.getByTestId("public-profile-theme").evaluate(
      (element) =>
        getComputedStyle(element).getPropertyValue("--profile-primary").trim(),
    );
    const shellAccent = await page
      .getByRole("link", { name: "PartnerBird WebMCP demo home" })
      .locator("[data-brand-mark] > span")
      .evaluate((element) => getComputedStyle(element).backgroundColor);
    await page.locator("html").evaluate((element) => {
      element.style.setProperty("--green", "#C85D4A");
    });

    const contextButton = page.getByRole("button", { name: "About Darren" });
    await expect(contextButton).toBeVisible();
    await expect(page.getByRole("heading", { name: "PartnerBird knows about" })).toBeHidden();

    await contextButton.click();
    const dialog = page.getByRole("dialog", { name: "About Darren" });
    await expect(dialog).toBeVisible();
    expect(
      await dialog.evaluate((element) =>
        getComputedStyle(element).getPropertyValue("--profile-primary").trim(),
      ),
    ).toBe(shellPrimary);
    await expect(dialog).toContainText("Agenticert");
    expect(
      await dialog
        .getByText("Agenticert", { exact: true })
        .locator("svg")
        .evaluate((element) => getComputedStyle(element).color),
    ).toBe(shellAccent);
    await expect(dialog).toContainText("Sponsorships");
    await dialog.getByRole("button", { name: "Close profile details" }).click();
    await expect(dialog).toBeHidden();
  });
});
