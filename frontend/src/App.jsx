import { useState } from 'react';
import { PlanningProgress } from './PlanningProgress.jsx';

const userTasks = [
  { progressId: 1, title: 'Mapear requisitos do projeto', weight: 20, completed: true },
  { progressId: 2, title: 'Validar responsáveis e prazos', weight: 20, completed: false },
  { progressId: 3, title: 'Preparar ambiente de trabalho', weight: 25, completed: false },
  { progressId: 4, title: 'Executar plano de implantação', weight: 20, completed: false },
  { progressId: 5, title: 'Revisar resultados e pendências', weight: 15, completed: false },
];

const demoAssignments = [
  {
    id: 1,
    plan: 'Plano de implantação',
    person: 'Marina Costa',
    progress: 40,
    status: 'Em andamento',
    tasks: userTasks.map((task) => ({ ...task, completed: task.progressId <= 2 })),
  },
  {
    id: 2,
    plan: 'Revisão de processos',
    person: 'Rafael Mendes',
    progress: 15,
    status: 'Atenção',
    tasks: [
      { progressId: 6, title: 'Levantar processos atuais', weight: 15, completed: true },
      { progressId: 7, title: 'Identificar pontos de melhoria', weight: 25, completed: false },
      { progressId: 8, title: 'Validar novo fluxo com a equipe', weight: 35, completed: false },
      { progressId: 9, title: 'Documentar processo revisado', weight: 25, completed: false },
    ],
  },
  {
    id: 3,
    plan: 'Padronização de indicadores',
    person: 'Joana Alves',
    progress: 100,
    status: 'Concluído',
    tasks: [
      { progressId: 10, title: 'Definir indicadores prioritários', weight: 35, completed: true },
      { progressId: 11, title: 'Validar fontes de dados', weight: 35, completed: true },
      { progressId: 12, title: 'Publicar painel de acompanhamento', weight: 30, completed: true },
    ],
  },
];

function getSession() {
  const token = window.sessionStorage.getItem('authToken');
  if (!token) return null;

  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(payload), (character) => character.charCodeAt(0));
    const claims = JSON.parse(new TextDecoder().decode(bytes));
    if (!Number.isInteger(Number(claims.id)) || !['admin', 'user'].includes(claims.role) || claims.exp <= Date.now() / 1000) {
      throw new Error('Sessão inválida.');
    }
    return { token, id: Number(claims.id), role: claims.role, name: claims.name };
  } catch {
    window.sessionStorage.removeItem('authToken');
    return null;
  }
}

function signOut() {
  window.sessionStorage.removeItem('authToken');
  window.location.assign('/login');
}

function Header({ session, admin = false }) {
  return (
    <header className="topbar">
      <a className="brand" href="/" aria-label="Sistema de Planejamento, início">
        <span className="brand__mark" aria-hidden="true">SP</span>
        <span>Sistema de Planejamento</span>
      </a>
      <nav className="topbar-actions" aria-label="Navegação principal">
        {admin && <span className="topbar-link topbar-link--active">Administração</span>}
        <span className="mode-indicator"><span /> {session.name}</span>
        <button className="topbar-button" onClick={signOut} type="button">Sair</button>
      </nav>
    </header>
  );
}

function LoginPage({ nextPath }) {
  const [registering, setRegistering] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch(`/api/auth/${registering ? 'register' : 'login'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registering ? { name, email, password } : { email, password }),
      });
      const responseBody = await response.text();
      if (!responseBody && !response.ok) {
        throw new Error(`Backend indisponível (HTTP ${response.status}). Verifique a API e o PostgreSQL.`);
      }

      let result;
      try {
        result = responseBody ? JSON.parse(responseBody) : {};
      } catch {
        throw new Error('A API retornou uma resposta inválida. Verifique se o backend iniciou corretamente.');
      }

      if (!response.ok) throw new Error(result.error ?? 'Não foi possível autenticar.');
      if (!result.token || !result.user) throw new Error('A API não confirmou o login. Verifique a configuração do backend.');

      window.sessionStorage.setItem('authToken', result.token);
      const destination = result.user.role === 'admin' ? '/admin' : '/';
      window.location.assign(nextPath === '/admin' && result.user.role !== 'admin' ? '/' : destination);
    } catch (requestError) {
      setError(requestError instanceof TypeError
        ? 'Não foi possível conectar à API. Inicie o backend e confira a conexão com o PostgreSQL.'
        : requestError.message ?? 'Não foi possível autenticar.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-panel" aria-labelledby="auth-title">
        <a className="brand auth-brand" href="/" aria-label="Sistema de Planejamento">
          <span className="brand__mark" aria-hidden="true">SP</span>
          <span>Sistema de Planejamento</span>
        </a>
        <p className="eyebrow">ACESSO AO SISTEMA</p>
        <h1 id="auth-title">{registering ? 'Criar conta' : 'Entrar'}</h1>
        <p className="auth-subtitle">{nextPath === '/admin' ? 'Use uma conta administradora para continuar.' : 'Entre para acessar seus planejamentos.'}</p>
        <form className="auth-form" onSubmit={submit}>
          {registering && (
            <label>Nome<input autoComplete="name" maxLength={120} onChange={(event) => setName(event.target.value)} required value={name} /></label>
          )}
          <label>E-mail<input autoComplete="email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} /></label>
          <label>Senha<input autoComplete={registering ? 'new-password' : 'current-password'} minLength={registering ? 12 : undefined} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} /></label>
          {registering && <small className="auth-hint">Use pelo menos 12 caracteres.</small>}
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="auth-submit" disabled={submitting} type="submit">
            {submitting ? 'Aguarde…' : registering ? 'Criar conta de usuário' : 'Entrar'}
          </button>
        </form>
        <p className="auth-switch">
          {registering ? 'Já tem conta?' : 'Ainda não tem conta?'}{' '}
          <button type="button" onClick={() => { setRegistering(!registering); setError(''); }}>
            {registering ? 'Entrar' : 'Criar conta de usuário'}
          </button>
        </p>
      </section>
    </main>
  );
}

function UserDashboard({ session }) {
  return (
    <div className="app-shell">
      <Header session={session} />
      <main className="workspace">
        <div className="page-heading">
          <div><p className="eyebrow">ACOMPANHAMENTO</p><h1>Plano de implantação</h1><p className="page-subtitle">Execução das etapas e progresso do planejamento</p></div>
          <div className="plan-meta"><span className="plan-meta__label">RESPONSÁVEL</span><strong>{session.name}</strong></div>
        </div>
        <section className="plan-section" aria-labelledby="tasks-heading">
          <div className="section-heading">
            <div><h2 id="tasks-heading">Etapas do plano</h2><p>5 etapas <span aria-hidden="true">·</span> Limite de progresso: 100%</p></div>
            <span className="status-label"><span /> Em andamento</span>
          </div>
          <PlanningProgress assignmentId={1} tasks={userTasks} progressLimit={100} localOnly />
        </section>
        <p className="demo-note">O login é validado no servidor. Os dados do planejamento ainda são demonstrativos.</p>
      </main>
    </div>
  );
}

function AdminDashboard({ session }) {
  const [filter, setFilter] = useState('Todos');
  const [selectedId, setSelectedId] = useState(demoAssignments[0].id);
  const selected = demoAssignments.find((assignment) => assignment.id === selectedId);
  const visible = demoAssignments.filter((assignment) => (
    filter === 'Todos' || (filter === 'Concluídos' ? assignment.status === 'Concluído' : assignment.status === filter)
  ));
  const filters = [
    ['Todos', demoAssignments.length],
    ['Atenção', demoAssignments.filter((item) => item.status === 'Atenção').length],
    ['Concluídos', demoAssignments.filter((item) => item.status === 'Concluído').length],
  ];

  return (
    <div className="app-shell">
      <Header admin session={session} />
      <main className="admin-workspace">
        <div className="admin-heading"><div><p className="eyebrow">ADMINISTRAÇÃO</p><h1>Acompanhamento geral</h1><p className="page-subtitle">Planejamentos atribuídos e andamento das etapas</p></div><span className="admin-date">Dados de demonstração</span></div>
        <section className="admin-metrics" aria-label="Resumo dos planejamentos">
          <div className="admin-metric"><span>Planejamentos ativos</span><strong>03</strong><small>em acompanhamento</small></div>
          <div className="admin-metric admin-metric--attention"><span>Precisam de atenção</span><strong>01</strong><small>progresso abaixo do esperado</small></div>
          <div className="admin-metric admin-metric--complete"><span>Concluídos</span><strong>01</strong><small>planejamento finalizado</small></div>
        </section>
        <section className="admin-section" aria-labelledby="assignments-heading">
          <div className="admin-section-heading">
            <div><h2 id="assignments-heading">Atribuições</h2><p>Progresso por planejamento e responsável</p></div>
            <div className="admin-filters" role="group" aria-label="Filtrar atribuições">
              {filters.map(([label, count]) => (
                <button aria-pressed={filter === label} className={filter === label ? 'admin-filter admin-filter--active' : 'admin-filter'} key={label} onClick={() => setFilter(label)} type="button">
                  {label} <span>{count}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th scope="col">Planejamento</th><th scope="col">Responsável</th><th scope="col">Progresso</th><th scope="col">Status</th><th scope="col">Detalhes</th></tr></thead>
              <tbody>
                {visible.map((assignment) => (
                  <tr className={selectedId === assignment.id ? 'is-selected' : ''} key={assignment.id}>
                    <td data-label="Planejamento"><strong>{assignment.plan}</strong></td>
                    <td data-label="Responsável">{assignment.person}</td>
                    <td data-label="Progresso"><span className="admin-progress-cell"><span className="admin-progress-track"><span style={{ width: `${assignment.progress}%` }} /></span><strong>{assignment.progress}%</strong></span></td>
                    <td data-label="Status"><span className={`admin-status ${assignment.status === 'Atenção' ? 'admin-status--attention' : assignment.status === 'Concluído' ? 'admin-status--complete' : ''}`}>{assignment.status}</span></td>
                    <td data-label="Detalhes"><button className="admin-row-action" onClick={() => setSelectedId(assignment.id)} type="button">Ver etapas</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="admin-detail" aria-labelledby="detail-heading">
          <div className="admin-section-heading"><div><h2 id="detail-heading">{selected.plan}</h2><p>Etapas de {selected.person} <span aria-hidden="true">·</span> somente leitura</p></div><span className="admin-status">{selected.status}</span></div>
          <PlanningProgress assignmentId={selected.id} tasks={selected.tasks} progressLimit={100} readOnly />
        </section>
        <p className="demo-note">As credenciais são armazenadas com hash no servidor. Os dados do painel ainda são demonstrativos.</p>
      </main>
    </div>
  );
}

function AccessDenied({ session }) {
  return (
    <main className="access-denied">
      <p className="eyebrow">ACESSO RESTRITO</p>
      <h1>Esta área é exclusiva para administradores.</h1>
      <p>Conectado como {session.name}.</p>
      <a href="/">Voltar aos meus planejamentos</a>
      <button className="topbar-button" onClick={signOut} type="button">Sair</button>
    </main>
  );
}

export default function App() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  const session = getSession();
  if (path === '/login') return session?.role === 'admin' ? <AdminDashboard session={session} /> : session ? <UserDashboard session={session} /> : <LoginPage nextPath="/" />;
  if (!session) return <LoginPage nextPath={path} />;
  if (path === '/admin' && session.role !== 'admin') return <AccessDenied session={session} />;
  if (path === '/admin' || session.role === 'admin') return <AdminDashboard session={session} />;
  return <UserDashboard session={session} />;
}