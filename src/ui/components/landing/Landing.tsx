import { useEffect, useState, type ReactNode } from 'react'
import type { AuthGateway } from '../../../ports/auth'
import { SignInForm } from '../../SignIn'
import { Brand } from '../brand/Brand'
import './landing.css'

/**
 * The home for visitors: one screen, no scroll. Talking to an assistant in plain words is the
 * product, so the page shows exactly that: what you ask, what the assistant does in Resume.
 */

type Scene = {
  assistant: string
  /** How people would ask it (the list on the left). */
  prompt: string
  /** The same, as typed in the chat. */
  ask: string
  /** The Resume tools the assistant uses, in words. */
  tools: string
  answer: string
}

const SCENES: Scene[] = [
  {
    assistant: 'ChatGPT',
    prompt: 'De toda la info que tenés de mí, actualizá mi CV',
    ask: 'De toda la info que tenés de mí, actualizá mi CV en Resume.',
    tools: 'Resume · actualizar perfil y experiencias',
    answer: 'Listo: cargué tus 4 trabajos, tus estudios y 12 logros con resultados. ¿Sumo tus proyectos?',
  },
  {
    assistant: 'Claude',
    prompt: 'Estoy por aplicar a esto <link>, armame el CV perfecto',
    ask: 'Estoy por aplicar a esto: linkedin.com/jobs/view/4021… Armame el CV perfecto.',
    tools: 'Resume · revisar duplicados, armar CV, crear postulación',
    answer: 'Armé «Staff Backend — Globex»: 1 página, 9 de 10 keywords del aviso. Ya está en tus postulaciones.',
  },
  {
    assistant: 'Gemini',
    prompt: 'Me confirmaron de Globex, paso al challenge el 20/3',
    ask: 'Me confirmaron de Globex, pasé al challenge técnico. Es el 20/3.',
    tools: 'Resume · mover postulación, agendar',
    answer: 'Hecho: Globex pasó a Challenge técnico y te agendé el 20/3. ¡Éxitos!',
  },
]

const SCENE_MS = 5600

function useScene(): number {
  const [scene, setScene] = useState(0)
  useEffect(() => {
    const timer = window.setInterval(() => setScene((current) => (current + 1) % SCENES.length), SCENE_MS)
    return () => window.clearInterval(timer)
  }, [])
  return scene
}

export function Landing({ auth, devMailbox }: { auth: AuthGateway; devMailbox: string }) {
  const scene = useScene()
  return (
    <div className="landing">
      <header className="landing-head">
        <Brand size={34} />
      </header>

      <main className="landing-main">
        <section className="landing-copy">
          <h1 className="landing-title">
            Organizá tu CV y trackeá tus postulaciones con{' '}
            <span className="sr-only">ChatGPT, Claude o Gemini</span>
            <span className="landing-rotator" aria-hidden="true">
              {SCENES.map((item, index) => (
                <span key={item.assistant} className={index === scene ? 'is-active' : index === (scene + SCENES.length - 1) % SCENES.length ? 'is-leaving' : undefined}>
                  {item.assistant}
                </span>
              ))}
            </span>
          </h1>
          <p className="landing-lede">
            Hablale a tu asistente como a una persona. Arma tu CV a medida para cada aviso, lleva cada postulación y vos lo ves
            todo acá, al instante.
          </p>

          <div className="landing-asks">
            <h2>Pedile cosas como</h2>
            <ol>
              {SCENES.map((item, index) => (
                <li key={item.assistant} className={index === scene ? 'is-active' : undefined}>
                  “{item.prompt}”
                </li>
              ))}
            </ol>
          </div>

          <div className="landing-cta">
            <SignInForm auth={auth} devMailbox={devMailbox} inline />
          </div>
          <p className="landing-fine">Funciona con ChatGPT, Claude, Gemini y cualquier asistente compatible con MCP.</p>
        </section>

        <AppPreview scene={scene} />
      </main>

      <footer className="landing-foot">
        <span>
          <b>Re</b>tro <b>Su</b>mmer <b>Me</b>mo
        </span>
        <span>Tus datos son tuyos: solo vos y los asistentes que conectes los ven.</span>
      </footer>
    </div>
  )
}

/** A live-looking slice of the app: the board reacts to what the chat asks. */
function AppPreview({ scene }: { scene: number }) {
  const current = SCENES[scene]
  const globex = scene === 1 ? 'sent' : scene === 2 ? 'challenge' : null
  return (
    <div className="landing-visual" aria-hidden="true">
      <div className="preview-window">
        <div className="preview-bar">
          <span />
          <span />
          <span />
          <em>retro-summer-memo.com</em>
        </div>
        <div className="preview-body">
          <div className="preview-head">
            <strong>Postulaciones</strong>
            <span className="preview-count">{globex ? 3 : 2}</span>
            <span className="preview-live">En vivo</span>
          </div>
          {scene === 0 ? (
            <div key={`toast-${scene}`} className="preview-toast">
              Perfil actualizado · 4 trabajos · 12 logros
            </div>
          ) : null}
          <div className="preview-board">
            <Column name="CV enviado" tone="gray">
              {globex === 'sent' ? <Card key="globex-sent" company="Globex Payments" role="Staff Backend Engineer" chip="CV · 1 página" fresh /> : null}
              <Card company="Northwind" role="Engineering Manager" meta="hace 3 semanas" metaTone="stale" />
            </Column>
            <Column name="Call con RRHH" tone="purple">
              <Card company="Acme" role="Tech Lead" meta="hoy" />
            </Column>
            <Column name="Challenge técnico" tone="amber">
              {globex === 'challenge' ? (
                <Card key="globex-challenge" company="Globex Payments" role="Staff Backend Engineer" meta="Próx.: 20 mar" metaTone="next" fresh />
              ) : null}
            </Column>
          </div>
        </div>
      </div>

      <div className="preview-chat">
        <div className="chat-head">
          <span className="chat-spark">✦</span>
          <strong key={current.assistant} className="chat-assistant">
            {current.assistant}
          </strong>
          <span className="chat-linked">Resume conectado</span>
        </div>
        <div key={scene} className="chat-thread">
          <p className="chat-ask">{current.ask}</p>
          <p className="chat-tools">
            <span className="chat-check">✓</span> {current.tools}
          </p>
          <p className="chat-answer">{current.answer}</p>
        </div>
      </div>
    </div>
  )
}

function Column({ name, tone, children }: { name: string; tone: 'gray' | 'purple' | 'amber' | 'green'; children?: ReactNode }) {
  return (
    <div className={`preview-column tone-${tone}`}>
      <div className="preview-column-head">
        <i />
        {name}
      </div>
      {children}
    </div>
  )
}

function Card({
  company,
  role,
  meta,
  metaTone,
  chip,
  fresh = false,
}: {
  company: string
  role: string
  meta?: string
  metaTone?: 'stale' | 'next'
  chip?: string
  fresh?: boolean
}) {
  return (
    <div className={fresh ? 'preview-card is-fresh' : 'preview-card'}>
      <strong>{company}</strong>
      <span>{role}</span>
      {meta ? <small className={metaTone ? `is-${metaTone}` : undefined}>{meta}</small> : null}
      {chip ? <small className="preview-chip">{chip}</small> : null}
    </div>
  )
}
