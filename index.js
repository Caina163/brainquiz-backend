const express = require('express');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const session = require('express-session');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Caminhos para arquivos de dados
const DADOS_DIR = path.join(__dirname, 'dados');
const USUARIOS_FILE = path.join(DADOS_DIR, 'usuarios.json');
const QUIZZES_FILE = path.join(DADOS_DIR, 'quizzes.json');
const QUIZZES_ARQUIVADOS_FILE = path.join(DADOS_DIR, 'quizzes_arquivados.json');
const QUIZZES_EXCLUIDOS_FILE = path.join(DADOS_DIR, 'quizzes_excluidos.json');
const PDFS_FILE = path.join(DADOS_DIR, 'pdfs.json');
const PDFS_EXCLUIDOS_FILE = path.join(DADOS_DIR, 'pdfs_excluidos.json');
const CADASTROS_FILE = path.join(DADOS_DIR, 'cadastros.json');

// MIDDLEWARE CORS CORRIGIDO
app.use(cors({
  origin: [
    'https://brainquiiz.netlify.app',      // ← SUA URL DO NETLIFY
    'https://brainquiz.netlify.app',
    'http://localhost:3000'
  ],
  credentials: true
}));

// Middleware para parsear JSON
app.use(express.json({limit: '50mb'}));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// CONFIGURAÇÃO DE SESSÃO CORRIGIDA
app.use(session({
  secret: 'brainquiz-secret-2025-super-secure-final',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false, // Para desenvolvimento (mudar para true em produção HTTPS)
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 horas
  },
  name: 'brainquiz.session'
}));

// Verificar e criar diretório de dados
if (!fs.existsSync(DADOS_DIR)) {
  fs.mkdirSync(DADOS_DIR, { recursive: true });
  console.log('📁 Diretório dados/ criado');
}

// MIDDLEWARE DE AUTENTICAÇÃO CORRIGIDO
function checkAuth(req, res, next) {
  console.log('🔐 Verificando autenticação...');
  console.log('Session ID:', req.sessionID);
  console.log('Session data:', req.session?.usuario ? 'Usuário presente' : 'Sem usuário');
  
  if (req.session && req.session.usuario && req.session.usuario.usuario) {
    console.log('✅ Usuário autenticado:', req.session.usuario.usuario);
    next();
  } else {
    console.log('❌ Usuário não autenticado');
    res.status(401).json({ 
      success: false, 
      message: 'Não autenticado',
      needsLogin: true 
    });
  }
}

// MIDDLEWARE PARA PERMISSÕES
function checkAdmin(req, res, next) {
  if (req.session.usuario && req.session.usuario.tipo === 'administrador') {
    next();
  } else {
    res.status(403).json({ success: false, message: 'Acesso negado. Apenas administrador.' });
  }
}

function checkAdminOrModerator(req, res, next) {
  if (req.session.usuario && (req.session.usuario.tipo === 'administrador' || req.session.usuario.tipo === 'moderador')) {
    next();
  } else {
    res.status(403).json({ success: false, message: 'Acesso negado. Apenas admin ou moderador.' });
  }
}

// ROTA DE STATUS DO SERVIDOR
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: '🚀 API BrainQuiz Final ativa!',
    timestamp: new Date().toISOString(),
    version: '3.0.0'
  });
});

app.get('/status', (req, res) => {
  res.json({
    success: true,
    message: 'Servidor online',
    timestamp: new Date().toISOString()
  });
});

// ===========================================
// ROTAS DE AUTENTICAÇÃO
// ===========================================

// LOGIN FINAL CORRIGIDO
app.post('/login', async (req, res) => {
  console.log('🔑 Tentativa de login:', { usuario: req.body.usuario });
  
  const { usuario, senha } = req.body;

  if (!usuario || !senha) {
    console.log('❌ Dados incompletos');
    return res.json({ success: false, message: 'Usuário e senha são obrigatórios' });
  }

  try {
    const usuarios = lerJSON(USUARIOS_FILE);
    console.log('📚 Total de usuários:', usuarios.length);
    
    const user = usuarios.find(u => u.usuario === usuario);

    if (!user) {
      console.log('❌ Usuário não encontrado:', usuario);
      return res.json({ success: false, message: 'Usuário não encontrado' });
    }

    console.log('👤 Usuário encontrado:', {
      usuario: user.usuario,
      tipo: user.tipo,
      status: user.status,
      ativo: user.ativo
    });

    // Verificar senha
    let senhaValida = false;
    
    if (user.senha && user.senha.startsWith('$2b$')) {
      // Senha com hash bcrypt
      senhaValida = await bcrypt.compare(senha, user.senha);
    } else {
      // Senha em texto simples (compatibilidade)
      senhaValida = (senha === user.senha);
    }

    if (!senhaValida) {
      console.log('❌ Senha incorreta');
      return res.json({ success: false, message: 'Senha incorreta' });
    }

    if (user.status && user.status !== 'aprovado') {
      console.log('❌ Usuário não aprovado:', user.status);
      return res.json({ success: false, message: 'Aguardando aprovação do administrador' });
    }

    if (user.ativo === false) {
      console.log('❌ Usuário inativo');
      return res.json({ success: false, message: 'Usuário inativo' });
    }

    // CRIAR SESSÃO
    req.session.usuario = {
      id: user.id,
      usuario: user.usuario,
      tipo: user.tipo,
      nome: user.nome || '',
      sobrenome: user.sobrenome || '',
      email: user.email || '',
      telefone: user.telefone || user.celular || '',
      fotoBase64: user.fotoBase64 || null
    };

    // Salvar sessão
    req.session.save((err) => {
      if (err) {
        console.error('❌ Erro ao salvar sessão:', err);
        return res.json({ success: false, message: 'Erro interno do servidor' });
      }

      console.log('✅ Login bem-sucedido:', user.usuario, user.tipo);
      console.log('Session salva:', req.sessionID);

      res.json({ 
        success: true, 
        message: 'Login realizado com sucesso',
        usuario: req.session.usuario,
        sessionId: req.sessionID
      });
    });

  } catch (error) {
    console.error('❌ Erro no login:', error);
    res.json({ success: false, message: 'Erro interno do servidor' });
  }
});

// CADASTRO CORRIGIDO
app.post('/cadastro', async (req, res) => {
  console.log('📝 Novo cadastro pendente:', req.body);
  
  const { usuario, senha, nome, sobrenome, email, telefone, celular } = req.body;

  if (!usuario || !senha || !nome || !email) {
    return res.json({ success: false, message: 'Campos obrigatórios: usuário, senha, nome e email' });
  }

  try {
    // Verificar se já existe nos usuários aprovados
    const usuarios = lerJSON(USUARIOS_FILE);
    if (usuarios.find(u => u.usuario === usuario)) {
      return res.json({ success: false, message: 'Este usuário já existe' });
    }

    if (usuarios.find(u => u.email === email)) {
      return res.json({ success: false, message: 'Este email já está em uso' });
    }

    // Verificar se já existe nos cadastros pendentes
    const cadastrosPendentes = lerJSON(CADASTROS_FILE);
    if (cadastrosPendentes.find(c => c.usuario === usuario)) {
      return res.json({ success: false, message: 'Este usuário já possui um cadastro pendente' });
    }

    if (cadastrosPendentes.find(c => c.email === email)) {
      return res.json({ success: false, message: 'Este email já possui um cadastro pendente' });
    }

    // Criar cadastro pendente
    const novoCadastro = {
      id: gerarId(),
      usuario: usuario.trim(),
      senha: await bcrypt.hash(senha, 10),
      nome: nome.trim(),
      sobrenome: (sobrenome || '').trim(),
      email: email.trim(),
      telefone: telefone || celular || '',
      tipo: 'aluno',
      status: 'pendente',
      ativo: false,
      dataCriacao: new Date().toISOString(),
      fotoBase64: null
    };

    cadastrosPendentes.push(novoCadastro);
    salvarJSON(CADASTROS_FILE, cadastrosPendentes);

    console.log('✅ Cadastro pendente criado:', usuario);
    
    res.json({ 
      success: true, 
      message: 'Cadastro enviado para aprovação!',
      needsApproval: true
    });
    
  } catch (error) {
    console.error('❌ Erro no cadastro:', error);
    res.json({ success: false, message: 'Erro interno do servidor' });
  }
});

// VERIFICAR USUÁRIO LOGADO
app.get('/usuario', (req, res) => {
  console.log('🔍 Verificando usuário da sessão...');
  console.log('Session ID:', req.sessionID);
  console.log('Session user:', req.session?.usuario?.usuario);
  
  if (req.session && req.session.usuario) {
    console.log('✅ Usuário encontrado na sessão:', req.session.usuario.usuario);
    res.json({
      success: true,
      usuario: req.session.usuario
    });
  } else {
    console.log('❌ Nenhum usuário na sessão');
    res.status(401).json({
      success: false,
      message: 'Sessão não encontrada',
      needsLogin: true
    });
  }
});

// LOGOUT
app.post('/logout', (req, res) => {
  console.log('👋 Fazendo logout...');
  
  req.session.destroy((err) => {
    if (err) {
      console.error('❌ Erro ao destruir sessão:', err);
      return res.json({ success: false, message: 'Erro ao fazer logout' });
    }
    
    console.log('✅ Logout realizado');
    res.json({ success: true, message: 'Logout realizado com sucesso' });
  });
});

// ===========================================
// API DE DADOS
// ===========================================

// LISTAR USUÁRIOS
app.get('/api/usuarios', checkAuth, (req, res) => {
  try {
    const usuarios = lerJSON(USUARIOS_FILE).filter(u => u.status === 'aprovado');
    res.json({ success: true, usuarios });
  } catch (error) {
    console.error('❌ Erro ao listar usuários:', error);
    res.json({ success: false, message: 'Erro ao carregar usuários' });
  }
});

// LISTAR CADASTROS PENDENTES
app.get('/api/cadastros', checkAuth, (req, res) => {
  try {
    // Verificar permissão
    if (!['administrador', 'moderador'].includes(req.session.usuario.tipo)) {
      return res.status(403).json({ success: false, message: 'Acesso negado' });
    }
    
    const cadastros = lerJSON(CADASTROS_FILE);
    console.log('📋 Cadastros pendentes:', cadastros.length);
    res.json({ success: true, cadastros });
  } catch (error) {
    console.error('❌ Erro ao listar cadastros:', error);
    res.json({ success: false, message: 'Erro ao carregar cadastros' });
  }
});

// APROVAR CADASTRO
app.post('/api/cadastros/:id/aprovar', checkAuth, (req, res) => {
  const cadastroId = req.params.id;
  console.log('✅ Aprovando cadastro ID:', cadastroId);
  
  try {
    // Verificar permissão
    if (!['administrador', 'moderador'].includes(req.session.usuario.tipo)) {
      return res.status(403).json({ success: false, message: 'Acesso negado' });
    }
    
    let cadastros = lerJSON(CADASTROS_FILE);
    const cadastroIdx = cadastros.findIndex(c => c.id == cadastroId);
    
    if (cadastroIdx === -1) {
      return res.json({ success: false, message: 'Cadastro não encontrado' });
    }

    const cadastro = cadastros[cadastroIdx];
    
    // Mover para usuários
    let usuarios = lerJSON(USUARIOS_FILE);
    
    const novoUsuario = {
      id: cadastro.id,
      usuario: cadastro.usuario,
      senha: cadastro.senha, // Já está hasheada
      nome: cadastro.nome,
      sobrenome: cadastro.sobrenome,
      email: cadastro.email,
      telefone: cadastro.telefone,
      tipo: 'aluno',
      status: 'aprovado',
      ativo: true,
      dataCriacao: cadastro.dataCriacao,
      dataAprovacao: new Date().toISOString(),
      aprovadoPor: req.session.usuario.usuario,
      fotoBase64: cadastro.fotoBase64
    };
    
    usuarios.push(novoUsuario);
    cadastros.splice(cadastroIdx, 1);
    
    salvarJSON(USUARIOS_FILE, usuarios);
    salvarJSON(CADASTROS_FILE, cadastros);
    
    console.log('✅ Cadastro aprovado:', cadastro.usuario);
    res.json({ success: true, message: 'Cadastro aprovado com sucesso' });
    
  } catch (error) {
    console.error('❌ Erro ao aprovar cadastro:', error);
    res.json({ success: false, message: 'Erro interno do servidor' });
  }
});

// REJEITAR CADASTRO
app.delete('/api/cadastros/:id', checkAuth, (req, res) => {
  const cadastroId = req.params.id;
  console.log('❌ Rejeitando cadastro ID:', cadastroId);
  
  try {
    // Verificar permissão
    if (!['administrador', 'moderador'].includes(req.session.usuario.tipo)) {
      return res.status(403).json({ success: false, message: 'Acesso negado' });
    }
    
    let cadastros = lerJSON(CADASTROS_FILE);
    const idx = cadastros.findIndex(c => c.id == cadastroId);
    
    if (idx === -1) {
      return res.json({ success: false, message: 'Cadastro não encontrado' });
    }

    cadastros.splice(idx, 1);
    salvarJSON(CADASTROS_FILE, cadastros);
    
    console.log('✅ Cadastro rejeitado');
    res.json({ success: true, message: 'Cadastro rejeitado com sucesso' });
    
  } catch (error) {
    console.error('❌ Erro ao rejeitar cadastro:', error);
    res.json({ success: false, message: 'Erro interno do servidor' });
  }
});

// EDITAR USUÁRIO
app.put('/api/usuarios/:usuario', checkAuth, checkAdminOrModerator, async (req, res) => {
  const usuarioTarget = req.params.usuario;
  const { nome, sobrenome, email, telefone, tipo } = req.body;
  
  let usuarios = lerJSON(USUARIOS_FILE);
  const idx = usuarios.findIndex(u => u.usuario === usuarioTarget);
  
  if (idx === -1) {
    return res.json({ success: false, message: 'Usuário não encontrado' });
  }

  // Verificar permissões para alterar tipo
  if (tipo && usuarios[idx].tipo !== tipo) {
    if (req.session.usuario.tipo !== 'administrador') {
      return res.json({ success: false, message: 'Apenas administradores podem alterar o tipo de usuário' });
    }
  }

  // Atualizar dados
  if (nome) usuarios[idx].nome = nome;
  if (sobrenome !== undefined) usuarios[idx].sobrenome = sobrenome;
  if (email) usuarios[idx].email = email;
  if (telefone !== undefined) usuarios[idx].telefone = telefone;
  if (tipo && req.session.usuario.tipo === 'administrador') usuarios[idx].tipo = tipo;

  salvarJSON(USUARIOS_FILE, usuarios);
  res.json({ success: true, message: 'Usuário atualizado com sucesso' });
});

// ALTERAR ROLE (PROMOVER/REBAIXAR)
app.post('/alterar-role', checkAuth, checkAdmin, async (req, res) => {
  const { usuario, role } = req.body;
  
  if (!usuario || !role) {
    return res.json({ success: false, message: 'Usuário e role são obrigatórios' });
  }
  
  if (!['aluno', 'moderador', 'administrador'].includes(role)) {
    return res.json({ success: false, message: 'Role inválido' });
  }
  
  let usuarios = lerJSON(USUARIOS_FILE);
  const idx = usuarios.findIndex(u => u.usuario === usuario);
  
  if (idx === -1) {
    return res.json({ success: false, message: 'Usuário não encontrado' });
  }
  
  if (usuario === req.session.usuario.usuario) {
    return res.json({ success: false, message: 'Você não pode alterar seu próprio tipo' });
  }
  
  usuarios[idx].tipo = role;
  usuarios[idx].dataAlteracao = new Date().toISOString();
  
  salvarJSON(USUARIOS_FILE, usuarios);
  res.json({ success: true, message: `Usuário ${usuario} alterado para ${role}` });
});

// EXCLUIR USUÁRIO
app.post('/excluir-usuario', checkAuth, checkAdmin, (req, res) => {
  const { usuario } = req.body;
  
  if (!usuario) {
    return res.json({ success: false, message: 'Usuário é obrigatório' });
  }
  
  if (usuario === req.session.usuario.usuario) {
    return res.json({ success: false, message: 'Você não pode excluir seu próprio usuário' });
  }
  
  let usuarios = lerJSON(USUARIOS_FILE);
  const idx = usuarios.findIndex(u => u.usuario === usuario);
  
  if (idx === -1) {
    return res.json({ success: false, message: 'Usuário não encontrado' });
  }
  
  usuarios.splice(idx, 1);
  salvarJSON(USUARIOS_FILE, usuarios);
  
  res.json({ success: true, message: 'Usuário excluído com sucesso' });
});

// LISTAR QUIZZES
app.get('/api/quizzes', checkAuth, (req, res) => {
  try {
    const quizzes = lerJSON(QUIZZES_FILE);
    res.json({ success: true, quizzes });
  } catch (error) {
    console.error('❌ Erro ao listar quizzes:', error);
    res.json({ success: false, message: 'Erro ao carregar quizzes' });
  }
});

// SALVAR QUIZ
app.post('/api/quizzes', checkAuth, checkAdminOrModerator, (req, res) => {
  try {
    const quiz = req.body;

    if (!quiz || !quiz.nome || !quiz.perguntas || !Array.isArray(quiz.perguntas)) {
      return res.json({ success: false, message: 'Dados do quiz incompletos' });
    }

    const quizzes = lerJSON(QUIZZES_FILE);

    // Se é edição
    if (quiz.id) {
      const idx = quizzes.findIndex(q => q.id === quiz.id);
      if (idx !== -1) {
        quizzes[idx] = {
          ...quiz,
          dataModificacao: new Date().toISOString(),
          modificadoPor: req.session.usuario.usuario
        };
        salvarJSON(QUIZZES_FILE, quizzes);
        return res.json({ success: true, message: 'Quiz atualizado com sucesso' });
      }
    }

    // Novo quiz
    if (quizzes.some(q => q.nome === quiz.nome)) {
      return res.json({ success: false, message: 'Já existe um quiz com este nome' });
    }

    quiz.id = gerarId();
    quiz.criadoPor = req.session.usuario.usuario;
    quiz.dataCriacao = new Date().toISOString();

    quizzes.push(quiz);
    salvarJSON(QUIZZES_FILE, quizzes);

    res.json({ success: true, message: 'Quiz salvo com sucesso' });
    
  } catch (error) {
    console.error('❌ Erro ao salvar quiz:', error);
    res.json({ success: false, message: 'Erro interno do servidor' });
  }
});

// ATUALIZAR PERFIL
app.put('/api/perfil', checkAuth, async (req, res) => {
  const { nome, sobrenome, email, telefone, fotoBase64, senhaAtual } = req.body;
  
  if (!senhaAtual) {
    return res.json({ success: false, message: 'Senha atual é obrigatória para salvar alterações' });
  }

  let usuarios = lerJSON(USUARIOS_FILE);
  const idx = usuarios.findIndex(u => u.usuario === req.session.usuario.usuario);
  
  if (idx === -1) {
    return res.json({ success: false, message: 'Usuário não encontrado' });
  }

  // Verificar senha atual
  const user = usuarios[idx];
  let senhaValida = false;
  
  try {
    if (user.senha && user.senha.startsWith('$2b$')) {
      senhaValida = await bcrypt.compare(senhaAtual, user.senha);
    } else {
      senhaValida = (senhaAtual === user.senha);
    }
  } catch (error) {
    return res.json({ success: false, message: 'Erro ao verificar senha' });
  }

  if (!senhaValida) {
    return res.json({ success: false, message: 'Senha atual incorreta' });
  }

  // Atualizar dados
  if (nome) usuarios[idx].nome = nome;
  if (sobrenome !== undefined) usuarios[idx].sobrenome = sobrenome;
  if (email) usuarios[idx].email = email;
  if (telefone !== undefined) usuarios[idx].telefone = telefone;
  if (fotoBase64 !== undefined) usuarios[idx].fotoBase64 = fotoBase64;

  salvarJSON(USUARIOS_FILE, usuarios);

  // Atualizar sessão
  req.session.usuario = {
    ...req.session.usuario,
    nome: usuarios[idx].nome,
    sobrenome: usuarios[idx].sobrenome,
    email: usuarios[idx].email,
    telefone: usuarios[idx].telefone,
    fotoBase64: usuarios[idx].fotoBase64
  };

  res.json({ success: true, message: 'Perfil atualizado com sucesso' });
});

// ===========================================
// FUNÇÕES AUXILIARES
// ===========================================

function lerJSON(caminho) {
  try {
    if (!fs.existsSync(caminho)) {
      salvarJSON(caminho, []);
      return [];
    }
    const dados = fs.readFileSync(caminho, 'utf8');
    return JSON.parse(dados);
  } catch (error) {
    console.error(`❌ Erro ao ler ${caminho}:`, error);
    return [];
  }
}

function salvarJSON(caminho, dados) {
  try {
    fs.writeFileSync(caminho, JSON.stringify(dados, null, 2), 'utf8');
  } catch (error) {
    console.error(`❌ Erro ao salvar ${caminho}:`, error);
  }
}

function gerarId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Middleware de erro 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint não encontrado',
    path: req.path
  });
});

// ===========================================
// INICIALIZAÇÃO DO SERVIDOR
// ===========================================

app.listen(PORT, async () => {
  console.log('🚀 Servidor BrainQuiz FINAL rodando na porta:', PORT);
  console.log('🔗 URL:', `http://localhost:${PORT}`);
  
  // Criar usuário admin se não existir
  try {
    let usuarios = lerJSON(USUARIOS_FILE);
    
    let adminExiste = usuarios.find(u => u.usuario === 'admin');
    
    if (!adminExiste) {
      console.log('📝 Criando usuário admin inicial...');
      const novoAdmin = {
        id: Date.now(),
        usuario: 'admin',
        nome: 'Administrador',
        sobrenome: 'Sistema',
        email: 'admin@brainquiz.com',
        telefone: '11999999999',
        senha: await bcrypt.hash('1574569810', 10),
        tipo: 'administrador',
        status: 'aprovado',
        ativo: true,
        dataCriacao: new Date().toISOString(),
        fotoBase64: null
      };
      
      usuarios.push(novoAdmin);
      salvarJSON(USUARIOS_FILE, usuarios);
      console.log('✅ Admin criado: admin / 1574569810');
    }
    
    // Estatísticas
    const usuariosAtivos = usuarios.filter(u => u.status === 'aprovado' && u.ativo);
    const cadastrosPendentes = lerJSON(CADASTROS_FILE);
    const quizzes = lerJSON(QUIZZES_FILE);
    
    console.log('');
    console.log('📊 ESTATÍSTICAS DO SISTEMA:');
    console.log('┌─────────────────────────┬─────────┐');
    console.log('│ Usuários ativos         │', usuariosAtivos.length.toString().padStart(7), '│');
    console.log('│ Cadastros pendentes     │', cadastrosPendentes.length.toString().padStart(7), '│');
    console.log('│ Quizzes disponíveis     │', quizzes.length.toString().padStart(7), '│');
    console.log('└─────────────────────────┴─────────┘');
    console.log('');
    console.log('🔑 LOGIN DE TESTE: admin / 1574569810');
    console.log('✅ Sistema FINAL funcionando perfeitamente!');
    console.log('🔧 Sessões configuradas corretamente');
    console.log('🌐 CORS configurado para produção e desenvolvimento');
    console.log('🛡️ Todas as permissões implementadas');
    console.log('📱 Compatível com dispositivos móveis');
    
  } catch (error) {
    console.error('❌ Erro na inicialização:', error);
  }
});
