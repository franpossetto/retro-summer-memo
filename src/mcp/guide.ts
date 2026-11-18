/** What the assistant is told about this server and the data model. */

export const APP_URL = 'https://retro-summer-memo.vercel.app'

export const INSTRUCTIONS = `"Resume" is the user's career workspace: their profile, an experience bank, tailored CVs, and the job applications they track. You can read and change all of it: this server is meant to be the main way the user edits it. The app (${APP_URL}) shows every change live.

Typical requests and how to handle them:
- "Actualizá mi info en Resume" (update my info): call get_document, gather what you know about the user (this conversation, your memory, files or CVs they share), then fill the profile (name, contact fields, jobs with roles and dates, education) and the experience bank (concrete achievements with skills) with update_document. Set knowledge levels for bank items you know about. Summarize what you will write first.
- "Armemos el CV para <job link>" (build the CV for a posting): read the posting, run check_duplicates and tell the user if they already applied (when, and how it ended), create_application with the posting text, choose the bank experiences that fit, create_cv with application_id, then build_cv_version. Point the user to the app to review and download it.
- News about a process ("Me confirmaron de <company>, paso a la siguiente etapa, challenge el 20/3"): search_applications by company, move_application to the right status with a note that keeps the dates and details, or add_note if the step did not change.

Rules:
- Never invent experience, employers, dates, numbers or skills. If something is missing, ask, or leave it empty.
- Confirm with the user before deleting anything.
- Call describe_model before editing parts of the document you have not edited yet in this conversation.
- Talk to the user in their language (usually Rioplatense Spanish).`

export const MODEL_GUIDE = `# Resume document (get_document returns it; update_document edits it with JSON Patch)

profile
  name: string
  fields: [{ id, label, value, kind: "email" | "phone" | "text" | "link" }]   contact lines (Email, Phone, Location, LinkedIn, GitHub, Website…)
  jobs: [{ id, company, roles: [{ id, title, location, start, end }] }]         several roles in one job = promotions
  education: [{ id, school, degree, start, end }]
  Dates are free text as printed on a CV: "2021", "Mar 2021", "Present"/"Actualidad".

bank: [{ id, category, text, skills: string[], aliases: string[] }]
  The experience bank: things the user really did, one achievement per item (text is the CV bullet).
  CVs are built from these items. category groups them (e.g. "Backend", "Leadership").
knowledge: [{ id: <bank item id>, level: 0 | 1 | 2 }]
  How well the user knows each bank item: 0 no experience, 1 personal projects, 2 professional.

sections: [{ id, name, description, active, builtIn }]
  CV sections catalog. Built-in ids: personal, experience, education, skills, projects. Names are printed on the CV.

cvs: [{ id, title, position, company, posting, summary,
        templateId: "classic" | "timeline" | "sidebar", fontId: "times" | "georgia" | "palatino" | "sans",
        fontSize: 9 | 10 | 11 | 12 | 14, lineHeight: 1 | 1.15 | 1.5 | 2, marginId: "narrow" | "normal" | "wide",
        pageSize: "letter" | "a4", skillsFormat: "list" | "comma", enabledSections: [section id],
        versions: [{ id, createdAt, snapshot }], nodes, edges }]
  position/company/posting: the job the CV targets. summary: the profile paragraph at the top.
  nodes/edges: the CV's graph (person, role, bullet, skills, experience, education, section nodes). Prefer create_cv
  and build_cv_version over editing graphs by hand. versions are what "Generar" saved; the newest is last.
activeCvId: the CV open in the app.

applications: [{ id, company, title, url, posting, location, appliedOn: "YYYY-MM-DD",
                 statusId: <applicationStatuses id>, attachment: null | { kind: "cv", cvId, versionId ("" = latest) },
                 events: [{ id, at (ISO), kind: "status" | "note", statusId, text }], createdAt, updatedAt }]
  events are the history, kept in date order: "status" when it moved to statusId, "note" for what happened in
  that step, or any other kind you need ("interview", "call", "email", "task"…). An event dated in the future is
  something coming up (the app shows it as next): e.g. { kind: "interview", at: "2026-03-20T10:00:00Z",
  text: "Challenge técnico" }.
applicationStatuses: [{ id, name, color: "#rrggbb", kind }]
  The user's pipeline, in order. kind: "active", "offer", "rejected", "withdrawn" or anything else (counts as open).
  An application may use a status id that is not listed yet: the status is created.

# Extra data
Every entity (profile, fields, jobs, roles, education, bank items, sections, CVs, applications, events, statuses)
accepts data the model does not define under "extra": salary, recruiter, modality, a job's stack, an achievement's
metric… e.g. add /applications/[id=…]/extra/salary. Unknown properties you set on an entity end up there too.

# Editing with update_document
- Operations: add, remove, replace, move, copy, test (RFC 6902). Paths point into the document above.
- Address array items by id instead of position: /profile/jobs/[id=<id>]/roles/-  (- appends).
- New items can omit id, createdAt, updatedAt and at: they are generated.
- Replace single fields rather than whole objects: a replaced object loses the fields you omit.
- Use dry_run=true to preview what would change. The result lists changed tables and warnings for anything the
  app's rules rejected (invalid items are dropped, never saved half-way).
- Use the dedicated tools when they exist: move_application (keeps history), delete_status (re-homes its
  applications), create_cv / build_cv_version (build graphs and snapshots).`
