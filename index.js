const express = require('express');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const session = require('express-session');
const cors = require('cors');

const app = express();
const PORT = 3000;

// Caminhos para arquivos de dados
const DADOS_DIR = path.join(__dirname, 'dados');
const USUARIOS_FILE = path.join(DADOS_DIR, 'usuarios.json');
const QUIZZES_FILE = path.join(DADOS_DIR, 'quizzes.json');
const QUIZZES_ARQUIVADOS_FILE = path.join(DADOS_DIR, 'quizzes_arquivados.json');
const QUIZZES_EXCLUIDOS_FILE = path.join(DADOS_DIR, 'quizzes_excluidos.json');
const PDFS_FILE = path.join(DADOS_DIR, 'pdfs.json');
const PDFS_EXCLUIDOS_FILE = path.join(DADOS_DIR, 'pdfs_excluidos.json');
const CADASTROS_FILE = path.join(DADOS_DIR, 'cadastros.json');

// Middleware CORS
app.use(cors({
  origin: true,
  credentials: true
}));

// Middleware para parsear JSON e dados de formulário
app.use(express.json({limit: '50mb'}));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Configuração da sessão
app.use(session({
  secret: 'quiz-app-secret-2025-brainquiz',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false, // Para desenvolvimento (HTTP)
    maxAge: 24 * 60 * 60 * 1000 // 24 horas
  }
}));

// Verificar e criar diretório de dados se não existir
if (!fs.existsSync(DADOS_DIR)) {
  fs.mkdirSync(DADOS_DIR, { recursive: true });
  console.log('📁 Diretório dados/ criado');
}

// Middleware para checar autenticação
function checkAuth(req, res, next) {
  if (req.session && req.session.usuario && req.session.usuario.usuario) {
    next();
  } else {
    res.status(401).json({ success: false, message: 'Não autenticado' });
  }
}

// Middleware para checar permissão admin
function checkAdmin(req, res, next) {
  if (req.session.usuario && req.session.usuario.tipo === 'administrador') {
    next();
  } else {
    res.status(403).json({ success: false, message: 'Acesso negado. Apenas administrador.' });
  }
}

// Middleware para checar permissão admin ou moderador
function checkAdminOrModerator(req, res, next) {
  if (req.session.usuario && (req.session.usuario.tipo === 'administrador' || req.session.usuario.tipo === 'moderador')) {
    next();
  } else {
    res.status(403).json({ success: false, message: 'Acesso negado. Apenas admin ou moderador.' });
  }
}

// Serve arquivos estáticos da pasta public
app.use(express.static(path.join(__dirname, 'public')));

// ===========================================
// ROTAS PÚBLICAS (SEM AUTENTICAÇÃO) - CORRIGIDAS
// ===========================================

// ROTA PRINCIPAL - SEMPRE REDIRECIONA PARA LOGIN
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ROTAS DE LOGIN E CADASTRO
app.get('/index.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/cadastro.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'cadastro.html'));
});

// ===========================================
// ROTAS PROTEGIDAS (COM AUTENTICAÇÃO)
// ===========================================

app.get('/dashboard.html', checkAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/painel.html', checkAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'painel.html'));
});

app.get('/quiz.html', checkAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'quiz.html'));
});

// ===========================================
// API DE AUTENTICAÇÃO
// ===========================================

// LOGIN
app.post('/login', async (req, res) => {
  console.log('🔑 Tentativa de login:', req.body);
  
  const { usuario, senha } = req.body;

  if (!usuario || !senha) {
    console.log('❌ Dados incompletos');
    return res.json({ success: false, message: 'Usuário e senha são obrigatórios' });
  }

  const usuarios = lerJSON(USUARIOS_FILE);
  console.log('📚 Total de usuários no banco:', usuarios.length);
  
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
  
  try {
    if (user.senha && user.senha.startsWith('$2b$')) {
      // Senha com hash bcrypt
      senhaValida = await bcrypt.compare(senha, user.senha);
    } else {
      // Senha em texto simples (compatibilidade)
      senhaValida = (senha === user.senha);
    }
  } catch (error) {
    console.error('❌ Erro ao verificar senha:', error);
    return res.json({ success: false, message: 'Erro interno do servidor' });
  }

  if (!senhaValida) {
    console.log('❌ Senha incorreta para:', usuario);
    return res.json({ success: false, message: 'Senha incorreta' });
  }

  if (user.status !== 'aprovado') {
    console.log('❌ Usuário não aprovado:', user.status);
    return res.json({ success: false, message: 'Aguardando aprovação do administrador' });
  }

  if (user.ativo === false) {
    console.log('❌ Usuário inativo');
    return res.json({ success: false, message: 'Usuário inativo' });
  }

  // Salvar dados completos na sessão
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

  console.log('✅ Login bem-sucedido:', user.usuario, user.tipo);

  res.json({ 
    success: true, 
    message: 'Login realizado com sucesso',
    usuario: req.session.usuario
  });
});

// CADASTRO - CORRIGIDO PARA SISTEMA DE APROVAÇÃO
app.post('/cadastro', async (req, res) => {
  console.log('📝 Tentativa de cadastro PENDENTE:', req.body);
  
  const { usuario, senha, nome, sobrenome, email, telefone, celular } = req.body;

  if (!usuario || !senha || !nome || !email) {
    return res.json({ success: false, message: 'Campos obrigatórios: usuário, senha, nome e email' });
  }

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
    return res.json({ success: false, message: 'Este usuário já possui um cadastro pendente de aprovação' });
  }

  if (cadastrosPendentes.find(c => c.email === email)) {
    return res.json({ success: false, message: 'Este email já possui um cadastro pendente de aprovação' });
  }

  try {
    // CRIAR CADASTRO PENDENTE (não no usuarios.json)
    const novoCadastro = {
      id: gerarId(),
      usuario: usuario.trim(),
      senha: await bcrypt.hash(senha, 10), // Já hashear a senha
      nome: nome.trim(),
      sobrenome: (sobrenome || '').trim(),
      email: email.trim(),
      telefone: telefone || celular || '',
      tipo: 'aluno', // Padrão para novos cadastros
      status: 'pendente', // Status pendente para aprovação
      ativo: false, // Inativo até ser aprovado
      dataCriacao: new Date().toISOString(),
      fotoBase64: null
    };

    // SALVAR NO ARQUIVO DE CADASTROS PENDENTES
    cadastrosPendentes.push(novoCadastro);
    salvarJSON(CADASTROS_FILE, cadastrosPendentes);

    console.log('✅ Cadastro PENDENTE criado para aprovação:', usuario);
    
    res.json({ 
      success: true, 
      message: 'Cadastro enviado para aprovação!',
      needsApproval: true // Indica que precisa de aprovação
    });
    
  } catch (error) {
    console.error('❌ Erro no cadastro:', error);
    res.json({ success: false, message: 'Erro interno do servidor' });
  }
});

// LOGOUT
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true, message: 'Logout realizado com sucesso' });
  });
});

// ===========================================
// API DO USUÁRIO LOGADO
// ===========================================

app.get('/usuario', checkAuth, (req, res) => {
  res.json({
    success: true,
    usuario: req.session.usuario
  });
});

// ===========================================
// API DE USUÁRIOS
// ===========================================

// LISTAR USUÁRIOS
app.get('/api/usuarios', checkAuth, (req, res) => {
  const usuarios = lerJSON(USUARIOS_FILE).filter(u => u.status === 'aprovado');
  res.json({ success: true, usuarios });
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

// ALTERAR SENHA
app.put('/api/usuarios/:usuario/senha', checkAuth, checkAdminOrModerator, async (req, res) => {
  const usuarioTarget = req.params.usuario;
  const { novaSenha } = req.body;
  
  if (!novaSenha || novaSenha.length < 6) {
    return res.json({ success: false, message: 'Nova senha deve ter pelo menos 6 caracteres' });
  }

  let usuarios = lerJSON(USUARIOS_FILE);
  const idx = usuarios.findIndex(u => u.usuario === usuarioTarget);
  
  if (idx === -1) {
    return res.json({ success: false, message: 'Usuário não encontrado' });
  }

  try {
    usuarios[idx].senha = await bcrypt.hash(novaSenha, 10);
    salvarJSON(USUARIOS_FILE, usuarios);
    res.json({ success: true, message: 'Senha alterada com sucesso' });
  } catch (error) {
    console.error('❌ Erro ao alterar senha:', error);
    res.json({ success: false, message: 'Erro interno do servidor' });
  }
});

// EXCLUIR USUÁRIO
app.delete('/api/usuarios/:usuario', checkAuth, checkAdmin, (req, res) => {
  const usuarioTarget = req.params.usuario;
  
  if (usuarioTarget === req.session.usuario.usuario) {
    return res.json({ success: false, message: 'Você não pode excluir seu próprio usuário' });
  }

  let usuarios = lerJSON(USUARIOS_FILE);
  const idx = usuarios.findIndex(u => u.usuario === usuarioTarget);
  
  if (idx === -1) {
    return res.json({ success: false, message: 'Usuário não encontrado' });
  }

  usuarios.splice(idx, 1);
  salvarJSON(USUARIOS_FILE, usuarios);
  res.json({ success: true, message: 'Usuário excluído com sucesso' });
});

// ALTERAR ROLE (PROMOVER/REBAIXAR) - CORRIGIDA
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

// ALTERAR SENHA - CORRIGIDA
app.post('/alterar-senha', checkAuth, checkAdminOrModerator, async (req, res) => {
  const { usuario, novaSenha } = req.body;
  
  if (!usuario || !novaSenha) {
    return res.json({ success: false, message: 'Usuário e nova senha são obrigatórios' });
  }
  
  if (novaSenha.length < 6) {
    return res.json({ success: false, message: 'Nova senha deve ter pelo menos 6 caracteres' });
  }
  
  let usuarios = lerJSON(USUARIOS_FILE);
  const idx = usuarios.findIndex(u => u.usuario === usuario);
  
  if (idx === -1) {
    return res.json({ success: false, message: 'Usuário não encontrado' });
  }
  
  try {
    usuarios[idx].senha = await bcrypt.hash(novaSenha, 10);
    usuarios[idx].dataAlteracaoSenha = new Date().toISOString();
    
    salvarJSON(USUARIOS_FILE, usuarios);
    res.json({ success: true, message: 'Senha alterada com sucesso' });
  } catch (error) {
    console.error('❌ Erro ao alterar senha:', error);
    res.json({ success: false, message: 'Erro interno do servidor' });
  }
});

// EXCLUIR USUÁRIO - CORRIGIDA
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

// ===========================================
// API DE CADASTROS PENDENTES - CORRIGIDAS
// ===========================================

// LISTAR CADASTROS PENDENTES
app.get('/api/cadastros', checkAuth, checkAdminOrModerator, (req, res) => {
  const cadastros = lerJSON(CADASTROS_FILE);
  console.log('📋 Cadastros pendentes encontrados:', cadastros.length);
  res.json({ success: true, cadastros });
});

// APROVAR CADASTRO
app.post('/api/cadastros/:id/aprovar', checkAuth, checkAdminOrModerator, (req, res) => {
  const cadastroId = req.params.id;
  console.log('✅ Aprovando cadastro ID:', cadastroId);
  
  let cadastros = lerJSON(CADASTROS_FILE);
  const cadastroIdx = cadastros.findIndex(c => c.id == cadastroId);
  
  if (cadastroIdx === -1) {
    console.log('❌ Cadastro não encontrado:', cadastroId);
    return res.json({ success: false, message: 'Cadastro não encontrado' });
  }

  const cadastro = cadastros[cadastroIdx];
  console.log('📝 Movendo cadastro para usuarios.json:', cadastro.usuario);
  
  // Mover para usuários
  let usuarios = lerJSON(USUARIOS_FILE);
  
  const novoUsuario = {
    id: cadastro.id, // Manter o mesmo ID
    usuario: cadastro.usuario,
    senha: cadastro.senha, // Senha já está hasheada
    nome: cadastro.nome,
    sobrenome: cadastro.sobrenome,
    email: cadastro.email,
    telefone: cadastro.telefone,
    tipo: 'aluno', // Padrão para novos aprovados
    status: 'aprovado', // Agora aprovado
    ativo: true, // Ativar usuário
    dataCriacao: cadastro.dataCriacao,
    dataAprovacao: new Date().toISOString(),
    aprovadoPor: req.session.usuario.usuario,
    fotoBase64: cadastro.fotoBase64
  };
  
  usuarios.push(novoUsuario);
  cadastros.splice(cadastroIdx, 1); // Remover dos pendentes
  
  salvarJSON(USUARIOS_FILE, usuarios);
  salvarJSON(CADASTROS_FILE, cadastros);
  
  console.log('✅ Cadastro aprovado com sucesso:', cadastro.usuario);
  res.json({ success: true, message: 'Cadastro aprovado com sucesso' });
});

// REJEITAR CADASTRO
app.delete('/api/cadastros/:id', checkAuth, checkAdminOrModerator, (req, res) => {
  const cadastroId = req.params.id;
  console.log('❌ Rejeitando cadastro ID:', cadastroId);
  
  let cadastros = lerJSON(CADASTROS_FILE);
  const idx = cadastros.findIndex(c => c.id == cadastroId);
  
  if (idx === -1) {
    console.log('❌ Cadastro não encontrado:', cadastroId);
    return res.json({ success: false, message: 'Cadastro não encontrado' });
  }

  const cadastroRejeitado = cadastros[idx];
  console.log('🗑️ Removendo cadastro:', cadastroRejeitado.usuario);
  
  cadastros.splice(idx, 1);
  salvarJSON(CADASTROS_FILE, cadastros);
  
  console.log('✅ Cadastro rejeitado com sucesso');
  res.json({ success: true, message: 'Cadastro rejeitado com sucesso' });
});

// ===========================================
// API DE QUIZZES
// ===========================================

// LISTAR QUIZZES ATIVOS
app.get('/api/quizzes', checkAuth, (req, res) => {
  const quizzes = lerJSON(QUIZZES_FILE);
  res.json({ success: true, quizzes });
});

// LISTAR QUIZZES ARQUIVADOS
app.get('/api/quizzes/arquivados', checkAuth, checkAdminOrModerator, (req, res) => {
  const quizzesArquivados = lerJSON(QUIZZES_ARQUIVADOS_FILE);
  res.json({ success: true, quizzes: quizzesArquivados });
});

// LISTAR QUIZZES EXCLUÍDOS
app.get('/api/quizzes/excluidos', checkAuth, checkAdmin, (req, res) => {
  const quizzesExcluidos = lerJSON(QUIZZES_EXCLUIDOS_FILE);
  res.json({ success: true, quizzes: quizzesExcluidos });
});

// SALVAR QUIZ
app.post('/api/quizzes', checkAuth, checkAdminOrModerator, (req, res) => {
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
});

// ARQUIVAR QUIZ
app.put('/api/quizzes/:id/arquivar', checkAuth, checkAdminOrModerator, (req, res) => {
  const quizId = req.params.id;
  
  let quizzes = lerJSON(QUIZZES_FILE);
  const idx = quizzes.findIndex(q => q.id === quizId);
  
  if (idx === -1) {
    return res.json({ success: false, message: 'Quiz não encontrado' });
  }

  const quiz = quizzes[idx];
  quiz.arquivado = true;
  quiz.dataArquivamento = new Date().toISOString();
  
  let quizzesArquivados = lerJSON(QUIZZES_ARQUIVADOS_FILE);
  quizzesArquivados.push(quiz);
  quizzes.splice(idx, 1);
  
  salvarJSON(QUIZZES_FILE, quizzes);
  salvarJSON(QUIZZES_ARQUIVADOS_FILE, quizzesArquivados);
  
  res.json({ success: true, message: 'Quiz arquivado com sucesso' });
});

// DESARQUIVAR QUIZ
app.put('/api/quizzes/:id/desarquivar', checkAuth, checkAdminOrModerator, (req, res) => {
  const quizId = req.params.id;
  
  let quizzesArquivados = lerJSON(QUIZZES_ARQUIVADOS_FILE);
  const idx = quizzesArquivados.findIndex(q => q.id === quizId);
  
  if (idx === -1) {
    return res.json({ success: false, message: 'Quiz não encontrado nos arquivados' });
  }

  const quiz = quizzesArquivados[idx];
  delete quiz.arquivado;
  delete quiz.dataArquivamento;
  
  let quizzes = lerJSON(QUIZZES_FILE);
  quizzes.push(quiz);
  quizzesArquivados.splice(idx, 1);
  
  salvarJSON(QUIZZES_FILE, quizzes);
  salvarJSON(QUIZZES_ARQUIVADOS_FILE, quizzesArquivados);
  
  res.json({ success: true, message: 'Quiz desarquivado com sucesso' });
});

// EXCLUIR QUIZ
app.delete('/api/quizzes/:id', checkAuth, checkAdmin, (req, res) => {
  const quizId = req.params.id;
  
  let quizzes = lerJSON(QUIZZES_FILE);
  let idx = quizzes.findIndex(q => q.id === quizId);
  let origem = 'ativo';
  
  if (idx === -1) {
    // Procurar nos arquivados
    let quizzesArquivados = lerJSON(QUIZZES_ARQUIVADOS_FILE);
    idx = quizzesArquivados.findIndex(q => q.id === quizId);
    if (idx !== -1) {
      origem = 'arquivado';
      const quiz = quizzesArquivados[idx];
      quiz.excluido = true;
      quiz.dataExclusao = new Date().toISOString();
      
      let quizzesExcluidos = lerJSON(QUIZZES_EXCLUIDOS_FILE);
      quizzesExcluidos.push(quiz);
      quizzesArquivados.splice(idx, 1);
      
      salvarJSON(QUIZZES_ARQUIVADOS_FILE, quizzesArquivados);
      salvarJSON(QUIZZES_EXCLUIDOS_FILE, quizzesExcluidos);
      
      return res.json({ success: true, message: 'Quiz excluído com sucesso' });
    }
    return res.json({ success: false, message: 'Quiz não encontrado' });
  }

  const quiz = quizzes[idx];
  quiz.excluido = true;
  quiz.dataExclusao = new Date().toISOString();
  
  let quizzesExcluidos = lerJSON(QUIZZES_EXCLUIDOS_FILE);
  quizzesExcluidos.push(quiz);
  quizzes.splice(idx, 1);
  
  salvarJSON(QUIZZES_FILE, quizzes);
  salvarJSON(QUIZZES_EXCLUIDOS_FILE, quizzesExcluidos);
  
  res.json({ success: true, message: 'Quiz excluído com sucesso' });
});

// ALTERAR STATUS QUIZ - CORRIGIDA
app.post('/alterar-status-quiz', checkAuth, checkAdminOrModerator, (req, res) => {
  const { id, status } = req.body;
  
  if (!id || !status) {
    return res.json({ success: false, message: 'ID e status são obrigatórios' });
  }
  
  if (!['ativo', 'arquivado', 'excluido'].includes(status)) {
    return res.json({ success: false, message: 'Status inválido' });
  }
  
  // Procurar quiz em todos os arquivos
  let quizzes = lerJSON(QUIZZES_FILE);
  let quizzesArquivados = lerJSON(QUIZZES_ARQUIVADOS_FILE);
  let quizzesExcluidos = lerJSON(QUIZZES_EXCLUIDOS_FILE);
  
  let quiz = null;
  let origem = null;
  let idx = -1;
  
  // Procurar nos ativos
  idx = quizzes.findIndex(q => q.id === id);
  if (idx !== -1) {
    quiz = quizzes[idx];
    origem = 'ativo';
  } else {
    // Procurar nos arquivados
    idx = quizzesArquivados.findIndex(q => q.id === id);
    if (idx !== -1) {
      quiz = quizzesArquivados[idx];
      origem = 'arquivado';
    } else {
      // Procurar nos excluídos
      idx = quizzesExcluidos.findIndex(q => q.id === id);
      if (idx !== -1) {
        quiz = quizzesExcluidos[idx];
        origem = 'excluido';
      }
    }
  }
  
  if (!quiz) {
    return res.json({ success: false, message: 'Quiz não encontrado' });
  }
  
  // Remover da origem atual
  if (origem === 'ativo') {
    quizzes.splice(idx, 1);
  } else if (origem === 'arquivado') {
    quizzesArquivados.splice(idx, 1);
  } else if (origem === 'excluido') {
    quizzesExcluidos.splice(idx, 1);
  }
  
  // Atualizar status e adicionar ao destino
  quiz.status = status;
  quiz.dataAlteracao = new Date().toISOString();
  
  if (status === 'ativo') {
    delete quiz.arquivado;
    delete quiz.excluido;
    quizzes.push(quiz);
  } else if (status === 'arquivado') {
    quiz.arquivado = true;
    delete quiz.excluido;
    quizzesArquivados.push(quiz);
  } else if (status === 'excluido') {
    quiz.excluido = true;
    delete quiz.arquivado;
    quizzesExcluidos.push(quiz);
  }
  
  // Salvar alterações
  salvarJSON(QUIZZES_FILE, quizzes);
  salvarJSON(QUIZZES_ARQUIVADOS_FILE, quizzesArquivados);
  salvarJSON(QUIZZES_EXCLUIDOS_FILE, quizzesExcluidos);
  
  res.json({ success: true, message: `Quiz alterado para ${status} com sucesso` });
});

// ===========================================
// API DE PDFs
// ===========================================

// LISTAR PDFs
app.get('/api/pdfs', checkAuth, (req, res) => {
  const pdfs = lerJSON(PDFS_FILE);
  res.json({ success: true, pdfs });
});

// UPLOAD PDF - CORRIGIDA
app.post('/upload-pdf', checkAuth, checkAdminOrModerator, (req, res) => {
  const { nome, base64 } = req.body;
  
  if (!nome || !base64) {
    return res.json({ success: false, message: 'Nome e dados do PDF são obrigatórios' });
  }
  
  const pdfs = lerJSON(PDFS_FILE);
  
  const novoPdf = {
    id: gerarId(),
    nome,
    dados: base64,
    base64: base64, // Compatibilidade
    bloqueado: true,
    uploadedBy: req.session.usuario.usuario,
    uploadedAt: new Date().toISOString(),
    dataUpload: new Date().toISOString() // Compatibilidade
  };
  
  pdfs.push(novoPdf);
  salvarJSON(PDFS_FILE, pdfs);
  
  res.json({ success: true, message: 'PDF enviado com sucesso' });
});

// UPLOAD PDF (API)
app.post('/api/pdfs', checkAuth, checkAdminOrModerator, (req, res) => {
  const { nome, dados } = req.body;
  
  if (!nome || !dados) {
    return res.json({ success: false, message: 'Nome e dados do PDF são obrigatórios' });
  }

  const pdfs = lerJSON(PDFS_FILE);
  
  const novoPdf = {
    id: gerarId(),
    nome,
    dados,
    bloqueado: true,
    uploadedBy: req.session.usuario.usuario,
    dataUpload: new Date().toISOString()
  };

  pdfs.push(novoPdf);
  salvarJSON(PDFS_FILE, pdfs);

  res.json({ success: true, message: 'PDF enviado com sucesso' });
});

// ALTERAR STATUS DO PDF
app.put('/api/pdfs/:id/toggle-lock', checkAuth, checkAdmin, (req, res) => {
  const pdfId = req.params.id;
  
  let pdfs = lerJSON(PDFS_FILE);
  const idx = pdfs.findIndex(p => p.id === pdfId);
  
  if (idx === -1) {
    return res.json({ success: false, message: 'PDF não encontrado' });
  }

  pdfs[idx].bloqueado = !pdfs[idx].bloqueado;
  salvarJSON(PDFS_FILE, pdfs);
  
  const status = pdfs[idx].bloqueado ? 'bloqueado' : 'liberado';
  res.json({ success: true, message: `PDF ${status} com sucesso` });
});

// EXCLUIR PDF
app.delete('/api/pdfs/:id', checkAuth, checkAdmin, (req, res) => {
  const pdfId = req.params.id;
  
  let pdfs = lerJSON(PDFS_FILE);
  const idx = pdfs.findIndex(p => p.id === pdfId);
  
  if (idx === -1) {
    return res.json({ success: false, message: 'PDF não encontrado' });
  }

  const pdf = pdfs[idx];
  pdf.excluido = true;
  pdf.dataExclusao = new Date().toISOString();
  
  let pdfsExcluidos = lerJSON(PDFS_EXCLUIDOS_FILE);
  pdfsExcluidos.push(pdf);
  pdfs.splice(idx, 1);
  
  salvarJSON(PDFS_FILE, pdfs);
  salvarJSON(PDFS_EXCLUIDOS_FILE, pdfsExcluidos);
  
  res.json({ success: true, message: 'PDF excluído com sucesso' });
});

// ===========================================
// API DE PERFIL
// ===========================================

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
    if (user.senha && user.senha.startsWith('$2b'
  )) {
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
    message: 'Página não encontrada',
    path: req.path
  });
});

// ===========================================
// INICIALIZAÇÃO DO SERVIDOR
// ===========================================

app.listen(PORT, async () => {
  console.log('🚀 Servidor BrainQuiz rodando em http://localhost:' + PORT);
  
  // Verificar e criar usuário admin
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
      senha: await bcrypt.hash('admin123', 10),
      tipo: 'administrador',
      status: 'aprovado',
      ativo: true,
      dataCriacao: new Date().toISOString(),
      fotoBase64: null
    };
    
    usuarios.push(novoAdmin);
    salvarJSON(USUARIOS_FILE, usuarios);
    console.log('✅ Admin criado: admin / admin123');
  }
  
  const usuariosAtivos = usuarios.filter(u => u.status === 'aprovado' && u.ativo);
  const cadastrosPendentes = lerJSON(CADASTROS_FILE);
  
  console.log('');
  console.log('👥 USUÁRIOS DISPONÍVEIS PARA LOGIN:');
  console.log('┌─────────────────┬─────────────────┬─────────────────┐');
  console.log('│ Usuário         │ Nome            │ Tipo            │');
  console.log('├─────────────────┼─────────────────┼─────────────────┤');
  
  usuariosAtivos.forEach(u => {
    const usuario = u.usuario.padEnd(15);
    const nome = (u.nome || '').padEnd(15);
    const tipo = u.tipo.padEnd(15);
    console.log(`│ ${usuario} │ ${nome} │ ${tipo} │`);
  });
  
  console.log('└─────────────────┴─────────────────┴─────────────────┘');
  console.log('');
  console.log('👤 Usuários ativos:', usuariosAtivos.length);
  console.log('⏳ Cadastros pendentes:', cadastrosPendentes.length);
  console.log('🔗 Acesse: http://localhost:3000');
  console.log('🔑 LOGIN DE TESTE: admin / admin123');
  console.log('✅ Sistema CORRIGIDO - CADASTROS VÃO PARA APROVAÇÃO!');
  console.log('📝 Novos cadastros serão salvos em cadastros.json para aprovação');
});