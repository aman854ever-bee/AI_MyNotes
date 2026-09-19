import test from 'node:test'
import assert from 'node:assert/strict'
import {
  canConnect,
  providerRedirectUrl,
  requirementsFor,
  summarize,
  type CalendarProviderId,
  type CheckResult,
} from './calendarRequirements.ts'

const PROVIDERS: CalendarProviderId[] = ['google', 'microsoft']
const SUPABASE_URL = 'https://abcdefgh.supabase.co'

function check(status: CheckResult['status'], id = status): CheckResult {
  return { id, label: `${id} check`, status }
}

test('the redirect URL points at Supabase, not the app', () => {
  // The single most common cause of redirect_uri_mismatch: registering the
  // app's own URL with the provider instead of Supabase's callback.
  assert.equal(providerRedirectUrl(SUPABASE_URL), 'https://abcdefgh.supabase.co/auth/v1/callback')
})

test('the redirect URL tolerates a trailing slash', () => {
  assert.equal(providerRedirectUrl('https://x.supabase.co/'), 'https://x.supabase.co/auth/v1/callback')
  assert.equal(providerRedirectUrl('https://x.supabase.co///'), 'https://x.supabase.co/auth/v1/callback')
})

test('both providers describe themselves fully', () => {
  for (const id of PROVIDERS) {
    const req = requirementsFor(id, SUPABASE_URL)
    assert.equal(req.id, id)
    assert.ok(req.label.trim().length > 0)
    assert.ok(req.purpose.trim().length > 0)
    assert.ok(req.steps.length > 0, `${id} has no setup steps`)
    assert.ok(req.functionSecrets.length > 0, `${id} names no function secrets`)
    assert.ok(req.scopes.trim().length > 0)
  }
})

test('providers map to the right Supabase auth provider key', () => {
  // Supabase calls Microsoft "azure"; getting this wrong silently fails
  // the connect flow.
  assert.equal(requirementsFor('google', SUPABASE_URL).supabaseProvider, 'google')
  assert.equal(requirementsFor('microsoft', SUPABASE_URL).supabaseProvider, 'azure')
})

test('Microsoft asks for offline access, or refresh tokens never arrive', () => {
  const scopes = requirementsFor('microsoft', SUPABASE_URL).scopes
  assert.match(scopes, /offline_access/)
  assert.match(scopes, /Calendars\.Read/)
})

test('Google asks for read-only calendar access only', () => {
  const scopes = requirementsFor('google', SUPABASE_URL).scopes
  assert.match(scopes, /calendar\.readonly/)
  // No write scope should ever creep in — the app only reads.
  assert.doesNotMatch(scopes, /calendar\.events\b(?!\.readonly)/)
})

test('every step says where to do it, and the redirect step carries the URL', () => {
  for (const id of PROVIDERS) {
    const req = requirementsFor(id, SUPABASE_URL)
    for (const step of req.steps) {
      assert.ok(step.title.trim().length > 0, `${id} has a blank step title`)
      assert.ok(step.where.trim().length > 0, `${id}/"${step.title}" doesn't say where`)
    }
    const redirectStep = req.steps.find((s) => s.value === providerRedirectUrl(SUPABASE_URL))
    assert.ok(redirectStep, `${id} never shows the redirect URL to register`)
  }
})

test('steps involving credentials are flagged as secret', () => {
  for (const id of PROVIDERS) {
    const req = requirementsFor(id, SUPABASE_URL)
    const secretSteps = req.steps.filter((s) => s.secret)
    assert.ok(secretSteps.length > 0, `${id} flags no step as secret`)
    // A secret step must never carry the secret's *value* — only its name
    // or location. The app is never given the secret itself.
    for (const step of secretSteps) {
      if (step.value) {
        assert.match(step.value, /^[A-Z_, ]+$/, `${id}/"${step.title}" looks like it embeds a secret value`)
      }
    }
  }
})

test('canConnect blocks on any failure', () => {
  assert.equal(canConnect([check('pass'), check('pass')]), true)
  assert.equal(canConnect([check('pass'), check('fail')]), false)
  assert.equal(canConnect([check('fail')]), false)
})

test('canConnect treats warnings and skips as non-blocking', () => {
  // Warnings cover things only confirmable after connecting, so blocking
  // on them would be circular.
  assert.equal(canConnect([check('pass'), check('warn')]), true)
  assert.equal(canConnect([check('pass'), check('skipped')]), true)
  assert.equal(canConnect([]), true)
})

test('summarize leads with failures, then warnings', () => {
  assert.equal(summarize([check('pass'), check('fail')]).status, 'fail')
  assert.equal(summarize([check('pass'), check('warn')]).status, 'warn')
  assert.equal(summarize([check('pass'), check('pass')]).status, 'pass')
  assert.equal(summarize([check('fail', 'a'), check('warn', 'b')]).status, 'fail')
})

test('summarize names the single problem, or counts several', () => {
  const one = summarize([check('pass'), { id: 'x', label: 'Secrets are set', status: 'fail' }])
  assert.equal(one.text, 'Secrets are set')

  const many = summarize([check('fail', 'a'), check('fail', 'b')])
  assert.equal(many.text, '2 things need setting up')
})

test('summarize reports "not checked" for an empty run', () => {
  const empty = summarize([])
  assert.equal(empty.status, 'skipped')
  assert.match(empty.text, /[Nn]ot checked/)
})

test('an all-clear summary says it is ready', () => {
  assert.equal(summarize([check('pass')]).text, 'Ready to connect')
})
