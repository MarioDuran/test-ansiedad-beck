import React, { useEffect, useMemo, useState } from 'react';
import {
  ClipboardList,
  ArrowRight,
  CheckCircle,
  RefreshCcw,
  Database,
  User,
  AlertCircle,
  ShieldCheck,
  ChevronLeft,
  Minus,
  Plus,
  LogOut,
  BarChart3,
  CalendarDays,
  Download,
  Upload,
  PieChart,
  Target
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const QUESTIONS = [
  'Torpe o entumecido',
  'Acalorado',
  'Con temblor en las piernas',
  'Incapaz de relajarse',
  'Con temor a que ocurra lo peor',
  'Mareado, o que se le va la cabeza',
  'Con latidos del corazón fuertes y acelerados',
  'Inestable',
  'Atemorizado o asustado',
  'Nervioso',
  'Con sensación de bloqueo',
  'Con temblores en las manos',
  'Inquieto, inseguro',
  'Con miedo a perder el control',
  'Con sensación de ahogo',
  'Con temor a morir',
  'Con miedo',
  'Con problemas digestivos',
  'Con desvanecimientos',
  'Con rubor facial',
  'Con sudores, fríos o calientes'
];

const OPTIONS = [
  { value: 0, label: 'No' },
  { value: 1, label: 'Leve' },
  { value: 2, label: 'Moderado' },
  { value: 3, label: 'Bastante' }
];

const SEXO_ASIGNADO_OPTIONS = [
  'Femenino',
  'Masculino',
  'No encaja en femenino/masculino'
];

const DEFAULT_USER = {
  edad: '20',
  carrera: '',
  es_estudiante_tec: true,
  semestre: '1',
  sexo_asignado_nacer: ''
};

function getInterpretation(score) {
  if (score <= 21) return 'Ansiedad muy baja';
  if (score <= 35) return 'Ansiedad moderada';
  return 'Ansiedad severa';
}

function scoreClasses(score) {
  if (score >= 36) return {
    colorClass: 'text-red-600',
    bgClass: 'bg-red-50 border-red-200',
    ringClass: 'ring-red-100'
  };
  if (score >= 22) return {
    colorClass: 'text-yellow-600',
    bgClass: 'bg-yellow-50 border-yellow-200',
    ringClass: 'ring-yellow-100'
  };
  return {
    colorClass: 'text-green-600',
    bgClass: 'bg-green-50 border-green-200',
    ringClass: 'ring-green-100'
  };
}

async function apiRequest(path, options = {}, token = null) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await response.json() : null;

  if (!response.ok) {
    const detail = data?.detail;
    let message = 'Ocurrió un error al comunicarse con el servidor.';
    if (typeof detail === 'string') {
      message = detail;
    } else if (Array.isArray(detail)) {
      message = detail.map(item => item?.msg || JSON.stringify(item)).join(' ');
    } else if (detail && typeof detail === 'object') {
      message = detail.message || detail.error || JSON.stringify(detail);
    }
    throw new Error(message);
  }

  return data;
}

export default function App() {
  const [currentView, setCurrentView] = useState(() => {
    return window.location.pathname === '/admin' ? 'admin' : 'demographics';
  });
  const [currentUser, setCurrentUser] = useState(DEFAULT_USER);
  const [answers, setAnswers] = useState({});
  const [error, setError] = useState('');
  const [lastRecord, setLastRecord] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [token, setToken] = useState(() => localStorage.getItem('bai_admin_token') || '');
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [records, setRecords] = useState([]);
  const [stats, setStats] = useState([]);
  const [overview, setOverview] = useState(null);
  const [statsPeriod, setStatsPeriod] = useState('day');
  const [isAdminLoading, setIsAdminLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [replaceOnImport, setReplaceOnImport] = useState(false);
  const [importStatus, setImportStatus] = useState('');
  const [importErrors, setImportErrors] = useState([]);

  const answeredCount = Object.keys(answers).length;
  const progress = Math.round((answeredCount / QUESTIONS.length) * 100);

  const statsSummary = useMemo(() => {
    if (!stats.length) return { total: 0, average: 0 };
    const total = stats.reduce((acc, item) => acc + item.count, 0);
    const weighted = stats.reduce((acc, item) => acc + item.average_score * item.count, 0);
    return { total, average: total ? weighted / total : 0 };
  }, [stats]);

  const overviewTotal = overview?.total ?? statsSummary.total;

  const formatPercentage = (count, total = overviewTotal) => {
    if (!total) return '0.0%';
    return `${((count / total) * 100).toFixed(1)}%`;
  };

  const breakdownRows = (items = [], total = overviewTotal) => (items || []).map(item => [
    item.label,
    item.count,
    formatPercentage(item.count, total),
    Number(item.average_score || 0).toFixed(2)
  ]);

  const goHome = () => {
    window.history.pushState({}, '', '/');
    setCurrentView('demographics');
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDemographicsChange = (e) => {
    const { name, type, checked } = e.target;
    let { value } = e.target;

    if (name === 'es_estudiante_tec') {
      setCurrentUser(prev => ({
        ...prev,
        es_estudiante_tec: checked,
        semestre: checked ? (prev.semestre || '1') : ''
      }));
      setError('');
      return;
    }

    if (name === 'carrera') {
      value = value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
    }

    setCurrentUser(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    setError('');
  };

  const adjustAge = (amount) => {
    let currentAge = parseInt(currentUser.edad, 10) || 20;
    let newAge = currentAge + amount;
    if (newAge < 1) newAge = 1;
    if (newAge > 120) newAge = 120;
    setCurrentUser(prev => ({ ...prev, edad: newAge.toString() }));
    setError('');
  };

  const adjustSemester = (amount) => {
    if (!currentUser.es_estudiante_tec) return;
    let currentSemester = parseInt(currentUser.semestre, 10) || 1;
    let newSemester = currentSemester + amount;
    if (newSemester < 1) newSemester = 1;
    if (newSemester > 12) newSemester = 12;
    setCurrentUser(prev => ({ ...prev, semestre: newSemester.toString() }));
    setError('');
  };

  const startTest = (e) => {
    e.preventDefault();
    const age = Number(currentUser.edad);
    const semester = Number(currentUser.semestre);

    if (!age || age < 1 || age > 120 || !currentUser.carrera) {
      setError('Por favor, captura una edad válida y el acrónimo de carrera o área.');
      return;
    }

    if (currentUser.es_estudiante_tec && (!semester || semester < 1 || semester > 12)) {
      setError('Por favor, selecciona un semestre válido entre 1 y 12.');
      return;
    }

    if (!currentUser.sexo_asignado_nacer) {
      setError('Por favor, selecciona el sexo asignado al nacer.');
      return;
    }

    setError('');
    setCurrentView('test');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAnswerSelect = (questionIndex, value) => {
    setAnswers(prev => ({ ...prev, [questionIndex]: value }));
    setError('');
  };

  const submitTest = async () => {
    if (Object.keys(answers).length < QUESTIONS.length) {
      setError('Por favor, responde todas las preguntas antes de finalizar el test.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const answersArray = QUESTIONS.map((_, i) => answers[i]);
    const score = answersArray.reduce((acc, val) => acc + val, 0);

    setIsSubmitting(true);
    setError('');
    try {
      const saved = await apiRequest('/api/surveys', {
        method: 'POST',
        body: JSON.stringify({
          edad: Number(currentUser.edad),
          carrera: currentUser.carrera,
          es_estudiante_tec: currentUser.es_estudiante_tec,
          semestre: currentUser.es_estudiante_tec ? Number(currentUser.semestre) : null,
          sexo_asignado_nacer: currentUser.sexo_asignado_nacer,
          answers: answersArray
        })
      });
      setLastRecord(saved);
      setCurrentView('results');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForNextUser = () => {
    setCurrentUser(DEFAULT_USER);
    setAnswers({});
    setError('');
    setLastRecord(null);
    goHome();
  };

  const loadAdminData = async (authToken = token, period = statsPeriod) => {
    setIsAdminLoading(true);
    setError('');
    try {
      const [surveyData, statsData, overviewData] = await Promise.all([
        apiRequest('/api/admin/surveys?limit=200', {}, authToken),
        apiRequest(`/api/admin/stats?period=${period}`, {}, authToken),
        apiRequest('/api/admin/overview', {}, authToken)
      ]);
      setRecords(surveyData);
      setStats(statsData);
      setOverview(overviewData);
    } catch (err) {
      setError(err.message);
      if (err.message.toLowerCase().includes('token') || err.message.toLowerCase().includes('credenciales')) {
        setToken('');
        localStorage.removeItem('bai_admin_token');
      }
    } finally {
      setIsAdminLoading(false);
    }
  };

  const login = async (e) => {
    e.preventDefault();
    setError('');
    setIsAdminLoading(true);
    try {
      const data = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(loginForm)
      });
      localStorage.setItem('bai_admin_token', data.access_token);
      setToken(data.access_token);
      await loadAdminData(data.access_token);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsAdminLoading(false);
    }
  };

  const logout = () => {
    setToken('');
    localStorage.removeItem('bai_admin_token');
    setRecords([]);
    setStats([]);
    setOverview(null);
    setImportStatus('');
    setImportErrors([]);
  };

  const changePeriod = async (period) => {
    setStatsPeriod(period);
    if (token) await loadAdminData(token, period);
  };

  const exportCsv = async () => {
    setError('');
    try {
      const response = await fetch(`${API_URL}/api/admin/surveys/export-csv`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.detail || 'No se pudo exportar la base de datos.');
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `base-ansiedad-beck-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setImportStatus('CSV exportado correctamente.');
      setImportErrors([]);
    } catch (err) {
      setError(err.message);
    }
  };

  const importCsv = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (replaceOnImport) {
      const confirmed = window.confirm('Esta importación reemplazará todos los registros actuales por el contenido del CSV. ¿Continuar?');
      if (!confirmed) {
        event.target.value = '';
        return;
      }
    }

    setIsImporting(true);
    setError('');
    setImportStatus('');
    setImportErrors([]);
    try {
      const csvContent = await file.text();
      const result = await apiRequest('/api/admin/surveys/import-csv', {
        method: 'POST',
        body: JSON.stringify({ csv_content: csvContent, replace_existing: replaceOnImport })
      }, token);
      setImportStatus(`${result.imported} registro(s) importado(s). ${result.skipped} fila(s) omitida(s).`);
      setImportErrors(result.errors || []);
      await loadAdminData(token, statsPeriod);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsImporting(false);
      event.target.value = '';
    }
  };

  useEffect(() => {
    const handlePopState = () => {
      setCurrentView(window.location.pathname === '/admin' ? 'admin' : 'demographics');
      setError('');
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (currentView === 'admin' && token && records.length === 0 && stats.length === 0) {
      loadAdminData(token);
    }
  }, [currentView, token]);

  const renderDemographics = () => (
    <div className="max-w-md mx-auto bg-white p-8 sm:p-10 rounded-[2rem] shadow-xl shadow-blue-900/5 border border-slate-100 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-2 bg-blue-600"></div>
      <div className="flex flex-col items-center justify-center mb-8">
        <div className="bg-blue-50 p-4 rounded-full text-blue-600 mb-4">
          <User size={36} strokeWidth={2.5} />
        </div>
        <h2 className="text-3xl font-extrabold text-slate-800 text-center tracking-tight">Bienvenido</h2>
        <p className="text-slate-500 text-center mt-2 text-sm max-w-[280px]">Ingresa tus datos para comenzar la evaluación confidencial.</p>
      </div>
      {error && <ErrorBox message={error} />}
      <form onSubmit={startTest} className="space-y-6">
        <div className="space-y-1.5">
          <label className="block text-sm font-bold text-slate-700 pl-1">Edad</label>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => adjustAge(-1)} className="h-14 w-14 bg-slate-100 rounded-xl hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center active:scale-95 transition-all focus:ring-2 focus:ring-blue-500 outline-none shrink-0"><Minus size={20} /></button>
            <input type="number" name="edad" min="1" max="120" value={currentUser.edad} onChange={handleDemographicsChange} className="flex-1 px-5 py-4 bg-slate-50 border-2 border-transparent focus:bg-white focus:border-blue-500 rounded-xl outline-none transition-all placeholder:text-slate-400 font-bold text-center text-slate-800 text-xl [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" placeholder="Ej. 20" />
            <button type="button" onClick={() => adjustAge(1)} className="h-14 w-14 bg-slate-100 rounded-xl hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center active:scale-95 transition-all focus:ring-2 focus:ring-blue-500 outline-none shrink-0"><Plus size={20} /></button>
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm font-bold text-slate-700 pl-1">Acrónimo de Carrera o Área</label>
          <input type="text" name="carrera" value={currentUser.carrera} onChange={handleDemographicsChange} maxLength={4} className="w-full px-5 py-4 bg-slate-50 border-2 border-transparent focus:bg-white focus:border-blue-500 rounded-xl outline-none transition-all placeholder:text-slate-400 font-bold text-slate-800 text-lg uppercase tracking-widest" placeholder="Ej. IMT, ITC, IIS, RH" />
        </div>
        <div className="space-y-3">
          <label className="block text-sm font-bold text-slate-700 pl-1">Tipo de participante</label>
          <label className="flex items-center gap-4 p-4 rounded-2xl border-2 border-slate-100 bg-slate-50 cursor-pointer hover:border-blue-200 transition-colors">
            <input type="checkbox" name="es_estudiante_tec" checked={currentUser.es_estudiante_tec} onChange={handleDemographicsChange} className="h-5 w-5 accent-blue-600 shrink-0" />
            <div>
              <div className="font-extrabold text-slate-800">Estudiante del Tec</div>
            </div>
          </label>
          {!currentUser.es_estudiante_tec && (
            <div className="px-4 py-3 rounded-2xl bg-blue-50 border border-blue-100 text-blue-800 font-extrabold text-sm">Personal del Tec</div>
          )}
        </div>
        {currentUser.es_estudiante_tec && (
          <div className="space-y-1.5">
            <label className="block text-sm font-bold text-slate-700 pl-1">Semestre</label>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => adjustSemester(-1)} className="h-14 w-14 bg-slate-100 rounded-xl hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center active:scale-95 transition-all focus:ring-2 focus:ring-blue-500 outline-none shrink-0"><Minus size={20} /></button>
              <input type="number" name="semestre" min="1" max="12" value={currentUser.semestre} onChange={handleDemographicsChange} className="flex-1 px-5 py-4 bg-slate-50 border-2 border-transparent focus:bg-white focus:border-blue-500 rounded-xl outline-none transition-all placeholder:text-slate-400 font-bold text-center text-slate-800 text-xl [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" placeholder="1" />
              <button type="button" onClick={() => adjustSemester(1)} className="h-14 w-14 bg-slate-100 rounded-xl hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center active:scale-95 transition-all focus:ring-2 focus:ring-blue-500 outline-none shrink-0"><Plus size={20} /></button>
            </div>
          </div>
        )}
        <div className="space-y-3">
          <label className="block text-sm font-bold text-slate-700 pl-1">Sexo asignado al nacer</label>
          <div className="grid grid-cols-1 gap-2">
            {SEXO_ASIGNADO_OPTIONS.map(option => {
              const isSelected = currentUser.sexo_asignado_nacer === option;
              return (
                <button key={option} type="button" onClick={() => { setCurrentUser(prev => ({ ...prev, sexo_asignado_nacer: option })); setError(''); }} className={`w-full px-4 py-3 rounded-2xl border-2 text-left font-bold transition-all ${isSelected ? 'border-blue-600 bg-blue-50 text-blue-900 ring-2 ring-blue-600/20' : 'border-slate-100 bg-white text-slate-600 hover:border-blue-200 hover:bg-slate-50'}`}>
                  {option}
                </button>
              );
            })}
          </div>
        </div>
        <button type="submit" className="w-full mt-8 bg-blue-600 text-white font-bold text-lg py-4 px-6 rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 active:scale-[0.98] flex items-center justify-center gap-2">
          Comenzar Evaluación <ArrowRight size={22} />
        </button>
      </form>
    </div>
  );

  const renderTest = () => (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white/95 backdrop-blur-md p-4 sm:p-6 rounded-3xl shadow-sm border border-slate-100 mb-6 sm:mb-8 sticky top-[4.5rem] sm:top-24 z-10">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="text-base sm:text-xl font-bold text-slate-800 leading-tight min-w-0">Prueba de Ansiedad de BECK</h2>
          <span className="text-xs sm:text-sm font-bold px-3 py-1 bg-blue-50 text-blue-700 rounded-full whitespace-nowrap shrink-0">{answeredCount} / {QUESTIONS.length}</span>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden"><div className="bg-blue-600 h-full rounded-full transition-all duration-500 ease-out" style={{ width: `${progress}%` }}></div></div>
        <p className="text-xs sm:text-sm text-slate-500 mt-3 sm:mt-4 font-medium leading-relaxed">Indique cuánto le ha afectado cada síntoma en la <strong className="text-slate-700">última semana, incluyendo hoy</strong>.</p>
        {error && <div className="mt-4"><ErrorBox message={error} /></div>}
      </div>
      <div className="space-y-6">
        {QUESTIONS.map((question, qIndex) => (
          <div key={qIndex} className="bg-white p-5 sm:p-8 rounded-[2rem] shadow-sm border border-slate-100 hover:shadow-md transition-shadow duration-300">
            <h3 className="text-lg sm:text-xl font-bold text-slate-800 mb-5 sm:mb-6 leading-snug"><span className="text-slate-400 mr-2">{qIndex + 1}.</span>{question}</h3>
            <div className="grid grid-cols-4 gap-2 sm:gap-3">
              {OPTIONS.map((opt) => {
                const isSelected = answers[qIndex] === opt.value;
                return (
                  <button key={opt.value} onClick={() => handleAnswerSelect(qIndex, opt.value)} className={`relative flex flex-col items-center justify-center min-h-16 sm:min-h-20 px-1.5 sm:px-4 py-3 sm:py-5 rounded-xl sm:rounded-2xl border-2 transition-all duration-200 outline-none active:scale-95 ${isSelected ? 'border-blue-600 bg-blue-50 shadow-sm ring-2 ring-blue-600/20' : 'border-slate-100 bg-white hover:border-blue-200 hover:bg-slate-50'}`}>
                    <span className={`text-[11px] sm:text-lg font-bold text-center leading-tight break-words ${isSelected ? 'text-blue-900' : 'text-slate-500'}`}>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-10 mb-8 flex justify-end">
        <button onClick={submitTest} disabled={isSubmitting} className="bg-slate-900 text-white font-bold py-5 px-8 rounded-2xl hover:bg-black transition-all shadow-xl shadow-slate-900/20 active:scale-[0.98] flex items-center gap-3 text-lg w-full sm:w-auto justify-center disabled:opacity-60">
          {isSubmitting ? 'Guardando...' : 'Ver Resultados de Evaluación'} <CheckCircle size={24} />
        </button>
      </div>
    </div>
  );

  const renderResults = () => {
    const record = lastRecord || {
      score: 0,
      edad: currentUser.edad,
      carrera: currentUser.carrera,
      es_estudiante_tec: currentUser.es_estudiante_tec,
      tipo_comunidad: currentUser.es_estudiante_tec ? 'Estudiante del Tec' : 'Personal del Tec',
      semestre: currentUser.es_estudiante_tec ? currentUser.semestre : null,
      sexo_asignado_nacer: currentUser.sexo_asignado_nacer,
      interpretation: getInterpretation(0)
    };
    const classes = scoreClasses(record.score);
    const tipoComunidad = record.tipo_comunidad || (record.es_estudiante_tec ? 'Estudiante del Tec' : 'Personal del Tec');
    return (
      <div className="max-w-md mx-auto bg-white p-8 sm:p-10 rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-100 text-center relative overflow-hidden">
        <div className="mb-8 flex justify-center"><div className={`p-5 rounded-full ${classes.bgClass} ring-8 ${classes.ringClass}`}><ClipboardList size={40} className={classes.colorClass} strokeWidth={2.5} /></div></div>
        <h2 className="text-3xl font-extrabold text-slate-800 mb-2 tracking-tight">Resultados</h2>
        <p className="text-slate-500 font-medium mb-8">Evaluación guardada exitosamente.</p>
        <div className={`p-8 rounded-3xl border-2 ${classes.bgClass} mb-8 relative overflow-hidden`}>
          <div className="relative z-10"><div className={`text-xs font-bold uppercase tracking-widest mb-2 ${classes.colorClass} opacity-80`}>Puntuación Total</div><div className={`text-7xl font-black mb-3 ${classes.colorClass} tracking-tighter`}>{record.score}</div><div className={`text-xl font-extrabold ${classes.colorClass}`}>{record.interpretation}</div></div>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-10 text-left">
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100"><div className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">Edad</div><div className="text-slate-800 font-semibold">{record.edad} años</div></div>
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100"><div className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">Comunidad</div><div className="text-slate-800 font-semibold">{tipoComunidad}</div></div>
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100"><div className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">Carrera/Área</div><div className="text-slate-800 font-semibold">{record.carrera}</div></div>
          {record.es_estudiante_tec && <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100"><div className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">Semestre</div><div className="text-slate-800 font-semibold">{record.semestre}</div></div>}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 col-span-2"><div className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">Sexo asignado al nacer</div><div className="text-slate-800 font-semibold">{record.sexo_asignado_nacer || 'No capturado'}</div></div>
        </div>
        <button onClick={resetForNextUser} className="w-full bg-blue-600 text-white font-bold text-lg py-4 px-6 rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 active:scale-[0.98] flex items-center justify-center gap-2"><RefreshCcw size={22} /> Evaluar a otra persona</button>
      </div>
    );
  };

  const renderLogin = () => (
    <div className="max-w-md mx-auto bg-white p-8 sm:p-10 rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-100">
      <div className="mb-8"><h2 className="text-3xl font-extrabold text-slate-900">Acceso</h2><p className="text-slate-500 text-sm mt-2">Inicia sesión para ver datos y estadísticas.</p></div>
      {error && <ErrorBox message={error} />}
      <form onSubmit={login} className="space-y-5">
        <input value={loginForm.username} onChange={e => setLoginForm({ ...loginForm, username: e.target.value })} placeholder="Usuario" className="w-full px-5 py-4 bg-slate-50 border-2 border-transparent focus:bg-white focus:border-blue-500 rounded-xl outline-none font-bold text-slate-800" />
        <input type="password" value={loginForm.password} onChange={e => setLoginForm({ ...loginForm, password: e.target.value })} placeholder="Contraseña" className="w-full px-5 py-4 bg-slate-50 border-2 border-transparent focus:bg-white focus:border-blue-500 rounded-xl outline-none font-bold text-slate-800" />
        <button disabled={isAdminLoading} className="w-full bg-slate-900 text-white font-bold text-lg py-4 px-6 rounded-xl hover:bg-black transition-all disabled:opacity-60">{isAdminLoading ? 'Entrando...' : 'Entrar'}</button>
      </form>
    </div>
  );

  const renderAdmin = () => {
    if (!token) return renderLogin();

    const periodLabel = statsPeriod === 'day' ? 'Día' : statsPeriod === 'month' ? 'Mes' : 'Año';
    const total = overview?.total || 0;
    const minMax = total ? `${overview.min_score} / ${overview.max_score}` : '—';

    return (
      <div className="max-w-6xl mx-auto bg-white p-6 sm:p-10 rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-100">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 gap-6 border-b border-slate-100 pb-8">
          <div>
            <div className="flex items-center gap-3 mb-2"><div className="bg-slate-900 p-2 rounded-lg text-white"><ShieldCheck size={24} /></div><h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Admin</h2></div>
            <p className="text-slate-500 font-medium">Total en base: <strong className="text-slate-800">{overviewTotal}</strong> · Mostrados: <strong className="text-slate-800">{records.length}</strong></p>
          </div>
          <div className="flex flex-wrap gap-3 w-full lg:w-auto">
            <button onClick={goHome} className="flex-1 lg:flex-none bg-slate-100 text-slate-700 font-bold py-3 px-5 rounded-xl hover:bg-slate-200 transition-colors flex items-center justify-center gap-2"><ChevronLeft size={20} /> Volver</button>
            <button onClick={() => loadAdminData()} disabled={isAdminLoading} className="flex-1 lg:flex-none bg-blue-600 text-white font-bold py-3 px-5 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"><Database size={20} /> Actualizar</button>
            <button onClick={exportCsv} disabled={isAdminLoading || isImporting} className="flex-1 lg:flex-none bg-emerald-50 text-emerald-700 font-bold py-3 px-5 rounded-xl hover:bg-emerald-100 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"><Download size={20} /> Exportar CSV</button>
            <label className={`flex-1 lg:flex-none bg-indigo-50 text-indigo-700 font-bold py-3 px-5 rounded-xl hover:bg-indigo-100 transition-colors flex items-center justify-center gap-2 ${isImporting ? 'opacity-60 pointer-events-none' : 'cursor-pointer'}`}><Upload size={20} /> {isImporting ? 'Importando...' : 'Importar CSV'}<input type="file" accept=".csv,text/csv" onChange={importCsv} className="hidden" /></label>
            <button onClick={logout} className="flex-1 lg:flex-none bg-red-50 text-red-700 font-bold py-3 px-5 rounded-xl hover:bg-red-100 transition-colors flex items-center justify-center gap-2"><LogOut size={20} /> Salir</button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 bg-slate-50 border border-slate-100 rounded-2xl p-4">
          <div>
            <div className="font-black text-slate-900">Respaldo CSV</div>
            <div className="text-sm text-slate-500 font-medium">Exporta toda la base o importa un archivo CSV previamente exportado.</div>
          </div>
          <label className="flex items-center gap-3 text-sm font-bold text-slate-700">
            <input type="checkbox" checked={replaceOnImport} onChange={e => setReplaceOnImport(e.target.checked)} className="h-5 w-5 accent-red-600" />
            Reemplazar base actual al importar
          </label>
        </div>

        {error && <ErrorBox message={error} />}
        {importStatus && <div className="mb-6 p-4 bg-emerald-50 text-emerald-700 text-sm font-bold rounded-xl border border-emerald-100">{importStatus}</div>}
        {importErrors.length > 0 && <div className="mb-6 p-4 bg-amber-50 text-amber-800 text-sm font-medium rounded-xl border border-amber-100"><div className="font-black mb-2">Filas omitidas</div><ul className="list-disc pl-5 space-y-1">{importErrors.slice(0, 8).map((item, index) => <li key={index}>{item}</li>)}</ul>{importErrors.length > 8 && <div className="mt-2 font-bold">Se muestran 8 de {importErrors.length} observaciones.</div>}</div>}

        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
          <MetricCard icon={<Database size={24} />} label="Total en base" value={overviewTotal} />
          <MetricCard icon={<BarChart3 size={24} />} label="Promedio general" value={Number(overview?.average_score || statsSummary.average || 0).toFixed(1)} />
          <MetricCard icon={<Target size={24} />} label="Mín / Máx" value={minMax} />
          <MetricCard icon={<CalendarDays size={24} />} label="Agrupación" value={periodLabel} />
        </section>

        <section className="mb-8">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-xl font-black text-slate-900">Estadísticas por periodo</h3>
              <p className="text-sm text-slate-500 font-medium">Promedio, mínimo y máximo de puntaje agrupados por fecha.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {[['day', 'Por día'], ['month', 'Por mes'], ['year', 'Por año']].map(([key, label]) => (
                <button key={key} onClick={() => changePeriod(key)} className={`px-4 py-2 rounded-xl font-bold text-sm ${statsPeriod === key ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>{label}</button>
              ))}
            </div>
          </div>
          <DataTable title="" empty="No hay estadísticas para mostrar." headers={['Periodo', 'N', 'Promedio', 'Mín', 'Máx']} rows={stats.map(s => [s.period, s.count, s.average_score.toFixed(2), s.min_score, s.max_score])} />
        </section>

        <section className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-blue-50 text-blue-600 p-2 rounded-xl"><PieChart size={22} /></div>
            <div>
              <h3 className="text-xl font-black text-slate-900">Distribuciones demográficas y clínicas</h3>
              <p className="text-sm text-slate-500 font-medium">Incluye comunidad, sexo asignado al nacer, semestre, carrera/área, edad y nivel de ansiedad.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
            <BreakdownTable title="Nivel de ansiedad" rows={breakdownRows(overview?.by_interpretation)} />
            <BreakdownTable title="Comunidad" rows={breakdownRows(overview?.by_community)} />
            <BreakdownTable title="Sexo asignado al nacer" rows={breakdownRows(overview?.by_sexo_asignado_nacer)} />
            <BreakdownTable title="Semestre" rows={breakdownRows(overview?.by_semestre, overview?.student_count || 0)} />
            <BreakdownTable title="Carrera/Área" rows={breakdownRows(overview?.by_carrera)} />
            <BreakdownTable title="Rango de edad" rows={breakdownRows(overview?.by_age_range)} />
          </div>
        </section>

        <DataTable title="Registros recientes" empty="Aún no hay participantes registrados." headers={['Fecha', 'Edad', 'Comunidad', 'Semestre', 'Sexo asignado al nacer', 'Carrera/Área', 'Puntaje', 'Nivel']} rows={records.map(r => [new Date(r.created_at).toLocaleString(), r.edad, r.tipo_comunidad || (r.es_estudiante_tec ? 'Estudiante del Tec' : 'Personal del Tec'), r.es_estudiante_tec ? (r.semestre || '-') : '-', r.sexo_asignado_nacer || 'No capturado', r.carrera, r.score, r.interpretation])} />
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/50 text-slate-900 font-sans selection:bg-blue-200 selection:text-blue-900 pb-12">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm shadow-slate-200/20">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 min-h-16 sm:h-20 flex items-center justify-center gap-3">
          <div className="flex items-center gap-2 sm:gap-3 text-blue-600 select-none max-w-full">
            <div className="bg-blue-600 text-white p-2 rounded-xl shrink-0"><ClipboardList size={26} strokeWidth={2.5} /></div>
            <span className="font-extrabold text-lg sm:text-2xl tracking-tight text-slate-800 leading-tight">Prueba de Ansiedad de BECK</span>
          </div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-3 sm:px-4 py-6 sm:py-12">
        {currentView === 'demographics' && renderDemographics()}
        {currentView === 'test' && renderTest()}
        {currentView === 'results' && renderResults()}
        {currentView === 'admin' && renderAdmin()}
      </main>
    </div>
  );
}

function ErrorBox({ message }) {
  return <div className="mb-6 p-4 bg-red-50 text-red-700 text-sm font-medium rounded-xl flex items-center gap-3"><AlertCircle size={20} className="shrink-0" /> {message}</div>;
}

function MetricCard({ icon, label, value }) {
  return (
    <div className="bg-slate-50 border border-slate-100 rounded-3xl p-5">
      <div className="text-blue-600 mb-3">{icon}</div>
      <div className="text-xs uppercase tracking-widest font-black text-slate-400 mb-1">{label}</div>
      <div className="text-3xl font-black text-slate-900">{value}</div>
    </div>
  );
}

function BreakdownTable({ title, rows }) {
  return (
    <section>
      <h4 className="text-lg font-black text-slate-900 mb-3">{title}</h4>
      {rows.length === 0 ? (
        <div className="text-center py-8 bg-slate-50 rounded-3xl border-2 border-slate-100 border-dashed text-slate-500 font-medium">Sin datos.</div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-sm">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 uppercase tracking-wider text-xs">
              <tr><th className="px-4 py-3">Categoría</th><th className="px-4 py-3">N</th><th className="px-4 py-3">%</th><th className="px-4 py-3">Promedio</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 font-medium bg-white">
              {rows.map((row, index) => <tr key={index} className="hover:bg-slate-50 transition-colors">{row.map((cell, i) => <td key={i} className="px-4 py-3">{cell}</td>)}</tr>)}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function DataTable({ title, empty, headers, rows }) {
  return (
    <section>
      {title && <h3 className="text-xl font-black text-slate-900 mb-4">{title}</h3>}
      {rows.length === 0 ? (
        <div className="text-center py-10 bg-slate-50 rounded-3xl border-2 border-slate-100 border-dashed text-slate-500 font-medium">{empty}</div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-sm">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 uppercase tracking-wider text-xs">
              <tr>{headers.map(h => <th key={h} className="px-4 py-3">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 font-medium bg-white">
              {rows.map((row, index) => <tr key={index} className="hover:bg-slate-50 transition-colors">{row.map((cell, i) => <td key={i} className="px-4 py-3">{cell}</td>)}</tr>)}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
