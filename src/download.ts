import type { CatalogSection, Snapshot } from './model'
import type { PageSize } from './fonts'

export function downloadPdf(pageSize: PageSize, title: string) {
  const previousTitle = document.title
  document.title = fileBase(title)
  document.body.dataset.page = pageSize
  document.body.classList.add('is-printing')
  const finish = () => {
    document.body.classList.remove('is-printing')
    delete document.body.dataset.page
    document.title = previousTitle
    window.removeEventListener('afterprint', finish)
  }
  window.addEventListener('afterprint', finish)
  window.print()
}

export function downloadDoc(title: string, snapshot: Snapshot, enabledSections: string[], sections: CatalogSection[]) {
  const html = resumeDocHtml(title, snapshot, enabledSections, sections)
  const blob = new Blob([`\uFEFF${html}`], { type: 'application/msword' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${fileBase(title)}.doc`
  link.click()
  URL.revokeObjectURL(url)
}

function fileBase(title: string) {
  const name = title.trim() || 'Resume'
  const safe = name.replace(/[\\/:*?"<>|]+/g, '').trim()
  return (safe || 'Resume').slice(0, 80)
}

function resumeDocHtml(title: string, snapshot: Snapshot, enabledSections: string[], sections: CatalogSection[]) {
  const enabled = new Set(enabledSections)
  const label = (id: string, fallback: string) => sections.find((section) => section.id === id)?.name.trim() || fallback
  const parts: string[] = []
  const personal = enabled.has('personal')
  const name = personal ? snapshot.profile.name.trim() : ''
  const contact = personal ? snapshot.profile.fields.filter((field) => field.value.trim()) : []
  if (name) parts.push(`<h1>${esc(name)}</h1>`)
  if (contact.length > 0) parts.push(`<p class="contact">${contact.map((field) => esc(field.value.trim())).join(' · ')}</p>`)
  if (snapshot.summary.trim()) parts.push(`<p>${esc(snapshot.summary.trim())}</p>`)

  if (!snapshot.placeholder && enabled.has('experience') && snapshot.roles.length > 0) {
    parts.push(`<h2>${esc(label('experience', 'Experience'))}</h2>`)
    for (const role of snapshot.roles) {
      const heading = [role.title, role.company, role.location].filter(Boolean).join(', ')
      const dates = [role.start, role.end].filter(Boolean).join(' – ')
      parts.push(`<p class="role"><strong>${esc(heading || 'Role')}</strong>${dates ? ` <span>${esc(dates)}</span>` : ''}</p>`)
      const bullets = role.bullets.filter((bullet) => bullet.text)
      if (bullets.length > 0) {
        parts.push(`<ul>${bullets.map((bullet) => `<li>${esc(bullet.text)}</li>`).join('')}</ul>`)
      }
    }
  }

  const education = !snapshot.placeholder && enabled.has('education') ? snapshot.education ?? [] : []
  const studies = education.filter((entry) => entry.school.trim() || entry.degree.trim())
  if (studies.length > 0) {
    parts.push(`<h2>${esc(label('education', 'Education'))}</h2>`)
    for (const entry of studies) {
      const heading = [entry.degree.trim(), entry.school.trim()].filter(Boolean).join(', ')
      const dates = [entry.start.trim(), entry.end.trim()].filter(Boolean).join(' – ')
      parts.push(`<p class="role"><strong>${esc(heading)}</strong>${dates ? ` <span>${esc(dates)}</span>` : ''}</p>`)
    }
  }

  const skills = !snapshot.placeholder && enabled.has('skills') ? snapshot.skills ?? [] : []
  if (skills.length > 0) {
    parts.push(`<h2>${esc(label('skills', 'Skills'))}</h2>`)
    parts.push(`<p>${skills.map((skill) => esc(skill)).join(' · ')}</p>`)
  }

  for (const block of snapshot.blocks ?? []) {
    if (snapshot.placeholder || !enabled.has(block.id) || block.entries.length === 0) continue
    parts.push(`<h2>${esc(block.name.trim() || label(block.id, 'Section'))}</h2>`)
    parts.push(`<ul>${block.entries.filter((entry) => entry.text.trim()).map((entry) => `<li>${esc(entry.text.trim())}</li>`).join('')}</ul>`)
  }

  if (parts.length === 0) parts.push(`<h1>${esc(fileBase(title))}</h1>`)

  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head>
<meta charset="utf-8">
<title>${esc(fileBase(title))}</title>
<style>
  body { font-family: Calibri, sans-serif; font-size: 11pt; color: #000; }
  h1 { font-size: 22pt; font-weight: 600; text-align: center; margin: 0 0 6pt; }
  h2 { font-size: 12pt; font-weight: 650; margin: 14pt 0 4pt; border-bottom: 1px solid #1f2328; }
  p { margin: 0 0 6pt; }
  .contact { text-align: center; color: #24292f; }
  .role span { float: right; }
  ul { margin: 0 0 8pt 18pt; }
</style>
</head>
<body>
${parts.join('\n')}
</body>
</html>`
}

function esc(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
