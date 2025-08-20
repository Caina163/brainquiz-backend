class DashboardManager {
  constructor() {
    this.baseURL = 'https://brainquiz-backend.onrender.com';
    this.dados = {
      quizzes: [],
      pdfs: [],
      arquivados: [],
      excluidos: [],
      usuarios: [],
      cadastros: []
    };
  }

  async inicializar() {
    try {
      // Verificar autenticação primeiro
      const usuario = await authManager.getUsuarioAtual();
      if (!usuario) {
        console.error('❌ Usuário não autenticado');
        window.location.href = 'https://brainquiiz.netlify.app/index.html';
        return;
      }

      console.log('✅ Dashboard iniciando para:', usuario.nome);
      
      this.exibirUsuario(usuario);
      await this.carregarTodosDados();
      this.configurarEventListeners();
      
    } catch (error) {
      console.error('Erro ao inicializar dashboard:', error);
      this.mostrarErro('Erro ao carregar dashboard. Tente recarregar a página.');
    }
  }

  exibirUsuario(usuario) {
    const nomeUsuarioElement = document.getElementById('nomeUsuario');
    const tipoUsuarioElement = document.getElementById('tipoUsuario');
    
    if (nomeUsuarioElement) {
      nomeUsuarioElement.textContent = `${usuario.nome} ${usuario.sobrenome || ''}`.trim();
    }
    
    if (tipoUsuarioElement) {
      tipoUsuarioElement.textContent = usuario.tipo === 'administrador' ? 'Administrador' : 
                                       usuario.tipo === 'moderador' ? 'Moderador' : 'Usuário';
    }
  }

  async carregarTodosDados() {
    try {
      this.mostrarCarregamento('Carregando dados...');

      // Carregar todos os dados em paralelo com fallbacks locais
      const promessas = [
        this.carregarComFallback('/api/quizzes', 'quizzes', './data/quizzes.json'),
        this.carregarComFallback('/api/pdfs', 'pdfs', './data/pdfs.json'),
        this.carregarComFallback('/api/quizzes/arquivados', 'arquivados', './data/quizzes_arquivados.json'),
        this.carregarComFallback('/api/quizzes/excluidos', 'excluidos', './data/quizzes_excluidos.json'),
        this.carregarComFallback('/api/usuarios', 'usuarios', './data/usuarios.json'),
        this.carregarComFallback('/api/cadastros-pendentes', 'cadastros', './data/cadastros.json')
      ];

      const resultados = await Promise.allSettled(promessas);
      
      resultados.forEach((resultado, index) => {
        const chaves = ['quizzes', 'pdfs', 'arquivados', 'excluidos', 'usuarios', 'cadastros'];
        if (resultado.status === 'fulfilled') {
          this.dados[chaves[index]] = resultado.value;
        } else {
          console.warn(`Falha ao carregar ${chaves[index]}:`, resultado.reason);
          this.dados[chaves[index]] = [];
        }
      });

      this.renderizarDados();
      
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      this.mostrarErro('Erro ao carregar alguns dados. Algumas funcionalidades podem estar limitadas.');
    } finally {
      this.esconderCarregamento();
    }
  }

  async carregarComFallback(endpoint, tipo, fallbackLocal) {
    try {
      // Tentar carregar do backend primeiro
      const response = await authManager.makeAuthenticatedRequest(`${this.baseURL}${endpoint}`);
      
      if (response.ok) {
        const data = await response.json();
        
        // Tentar diferentes estruturas de resposta
        if (data[tipo]) return data[tipo];
        if (data.data) return data.data;
        if (Array.isArray(data)) return data;
        if (data.success && data.dados) return data.dados;
        
        throw new Error('Estrutura de dados não reconhecida');
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      console.warn(`Falha no backend para ${tipo}, tentando arquivo local:`, error);
      
      try {
        // Tentar carregar arquivo JSON local como fallback
        const localResponse = await fetch(fallbackLocal);
        if (localResponse.ok) {
          const localData = await localResponse.json();
          console.log(`✅ Dados ${tipo} carregados do arquivo local`);
          return Array.isArray(localData) ? localData : [];
        }
      } catch (localError) {
        console.warn(`Falha no arquivo local para ${tipo}:`, localError);
      }
      
      // Se tudo falhar, retornar array vazio
      return [];
    }
  }

  renderizarDados() {
    this.renderizarQuizzes();
    this.renderizarPDFs();
    this.renderizarArquivados();
    this.renderizarExcluidos();
    this.renderizarUsuarios();
    this.renderizarCadastros();
    this.atualizarEstatisticas();
  }

  renderizarQuizzes() {
    const container = document.getElementById('quizzes-container');
    if (!container) return;

    if (this.dados.quizzes.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📝</div>
          <h3>Nenhum quiz criado ainda</h3>
          <p>Comece criando seu primeiro quiz!</p>
          <button class="btn btn-primary" onclick="window.location.href='https://brainquiiz.netlify.app/painel.html'">
            Criar Primeiro Quiz
          </button>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="section-header">
        <h3>📝 Quizzes Ativos (${this.dados.quizzes.length})</h3>
        <button class="btn btn-success" onclick="window.location.href='https://brainquiiz.netlify.app/painel.html'">
          + Novo Quiz
        </button>
      </div>
      <div class="quiz-grid">
        ${this.dados.quizzes.map(quiz => this.criarCardQuizAtivo(quiz)).join('')}
      </div>
    `;
  }

  criarCardQuizAtivo(quiz) {
    const titulo = quiz.titulo || quiz.nome || 'Quiz sem título';
    const perguntas = quiz.perguntas ? quiz.perguntas.length : 0;
    const dataModificacao = quiz.modificadoEm || quiz.criadoEm || new Date().toISOString();

    return `
      <div class="quiz-card-ativo" data-quiz-id="${quiz.id}" onclick="dashboardManager.jogarQuiz('${quiz.id}')">
        <div class="quiz-thumbnail">
          <div class="quiz-play-icon">▶️</div>
          <div class="quiz-background"></div>
        </div>
        <div class="quiz-info">
          <h4 class="quiz-title">${titulo}</h4>
          <div class="quiz-meta">
            <span class="quiz-questions">📊 ${perguntas} pergunta(s)</span>
            <span class="quiz-date">📅 ${this.formatarDataSimples(dataModificacao)}</span>
          </div>
        </div>
        <div class="quiz-actions" onclick="event.stopPropagation()">
          <button class="quiz-action-btn" onclick="dashboardManager.mostrarMenuQuiz(event, '${quiz.id}')" title="Mais opções">
            ⚙️
          </button>
        </div>
      </div>
    `;
  }

  mostrarMenuQuiz(event, quizId) {
    event.stopPropagation();
    
    // Remove menu existente se houver
    const menuExistente = document.querySelector('.quiz-menu-dropdown');
    if (menuExistente) {
      menuExistente.remove();
    }

    const menu = document.createElement('div');
    menu.className = 'quiz-menu-dropdown';
    menu.innerHTML = `
      <div class="menu-item" onclick="dashboardManager.jogarQuiz('${quizId}')">
        ▶️ Jogar Quiz
      </div>
      <div class="menu-item" onclick="dashboardManager.editarQuiz('${quizId}')">
        ✏️ Editar
      </div>
      <div class="menu-item" onclick="dashboardManager.arquivarQuiz('${quizId}')">
        📦 Arquivar
      </div>
      <div class="menu-item danger" onclick="dashboardManager.excluirQuiz('${quizId}')">
        🗑️ Excluir
      </div>
    `;

    // Posicionar menu
    const rect = event.target.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.top = `${rect.bottom + 5}px`;
    menu.style.left = `${rect.left - 120}px`;
    menu.style.zIndex = '1000';

    document.body.appendChild(menu);

    // Fechar menu ao clicar fora
    setTimeout(() => {
      document.addEventListener('click', function fecharMenu() {
        menu.remove();
        document.removeEventListener('click', fecharMenu);
      });
    }, 10);
  }

  renderizarUsuarios() {
    const container = document.getElementById('usuarios-container');
    if (!container) return;

    if (this.dados.usuarios.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">👥</div>
          <h3>Nenhum usuário cadastrado</h3>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="section-header">
        <h3>👥 Gerenciar Usuários</h3>
      </div>
      <div class="usuarios-grid">
        ${this.dados.usuarios.map(usuario => this.criarCardUsuarioGerencial(usuario)).join('')}
      </div>
    `;
  }

  criarCardUsuarioGerencial(usuario) {
    const nomeCompleto = `${usuario.nome} ${usuario.sobrenome || ''}`.trim();
    const tipoIcon = usuario.tipo === 'administrador' ? 'A' : 
                    usuario.tipo === 'moderador' ? 'M' : 'A';
    const tipoLabel = usuario.tipo === 'administrador' ? 'Admin Sistema' : 
                     usuario.tipo === 'moderador' ? 'Moderador Teste' : 'Aluno Exemplo';
    const status = usuario.ativo !== false ? '🟢' : '🔴';
    
    return `
      <div class="user-card-gerencial" data-user-id="${usuario.id}">
        <div class="user-avatar-section">
          <div class="user-avatar-circle ${usuario.tipo}">
            ${tipoIcon}
          </div>
          <div class="user-status-indicator">${status}</div>
        </div>
        <div class="user-info-section">
          <h4 class="user-name">${nomeCompleto}</h4>
          <p class="user-role">${tipoLabel}</p>
          <p class="user-email">${usuario.email || usuario.usuario + '@brainquiz.com'}</p>
          <p class="user-login">Último acesso: ${this.formatarDataSimples(usuario.ultimoLogin)}</p>
        </div>
        <div class="user-actions-section">
          <button class="btn-user-action" onclick="dashboardManager.editarUsuario('${usuario.id}')" title="Editar">
            ✏️
          </button>
          <button class="btn-user-action" onclick="dashboardManager.alternarStatusUsuario('${usuario.id}')" title="${usuario.ativo !== false ? 'Desativar' : 'Ativar'}">
            ${usuario.ativo !== false ? '⏸️' : '▶️'}
          </button>
          <button class="btn-user-action danger" onclick="dashboardManager.excluirUsuario('${usuario.id}')" title="Excluir">
            🗑️
          </button>
        </div>
      </div>
    `;
  }

  renderizarCadastros() {
    const container = document.getElementById('cadastros-container');
    if (!container) return;

    if (this.dados.cadastros.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">⏳</div>
          <h3>Nenhum cadastro pendente</h3>
          <p>Todos os cadastros foram processados</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="section-header">
        <h3>⏳ Cadastros Pendentes (${this.dados.cadastros.length})</h3>
      </div>
      <div class="cadastros-grid">
        ${this.dados.cadastros.map(cadastro => this.criarCardCadastroPendente(cadastro)).join('')}
      </div>
    `;
  }

  criarCardCadastroPendente(cadastro) {
    const nomeCompleto = `${cadastro.nome} ${cadastro.sobrenome || ''}`.trim();
    const dataCadastro = cadastro.dataCriacao || cadastro.dataEnvio || new Date().toISOString();

    return `
      <div class="cadastro-card-pendente" data-cadastro-id="${cadastro.id}">
        <div class="cadastro-header">
          <div class="cadastro-avatar">
            👤
          </div>
          <div class="cadastro-info">
            <h4 class="cadastro-nome">${nomeCompleto}</h4>
            <p class="cadastro-usuario">@${cadastro.usuario}</p>
          </div>
          <div class="cadastro-status">
            <span class="status-badge pendente">⏳ Pendente</span>
          </div>
        </div>
        <div class="cadastro-detalhes">
          <p><strong>📧 Email:</strong> ${cadastro.email}</p>
          <p><strong>📱 Telefone:</strong> ${cadastro.telefone || 'Não informado'}</p>
          <p><strong>📅 Solicitado em:</strong> ${this.formatarDataSimples(dataCadastro)}</p>
        </div>
        <div class="cadastro-actions">
          <button class="btn btn-success" onclick="dashboardManager.aprovarCadastro('${cadastro.id}')">
            ✅ Aprovar
          </button>
          <button class="btn btn-danger" onclick="dashboardManager.rejeitarCadastro('${cadastro.id}')">
            ❌ Rejeitar
          </button>
        </div>
      </div>
    `;
  }

  renderizarPDFs() {
    const container = document.getElementById('pdfs-container');
    if (!container) return;

    if (this.dados.pdfs.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📄</div>
          <h3>Nenhum PDF carregado ainda</h3>
          <p>Adicione documentos PDF para seus usuários</p>
          <input type="file" id="upload-pdf" accept=".pdf" style="display: none;" onchange="dashboardManager.uploadPDF(this)">
          <button class="btn btn-primary" onclick="document.getElementById('upload-pdf').click()">
            Carregar Primeiro PDF
          </button>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="section-header">
        <h3>📄 Gerenciar PDFs</h3>
        <input type="file" id="upload-pdf" accept=".pdf" style="display: none;" onchange="dashboardManager.uploadPDF(this)">
        <button class="btn btn-success" onclick="document.getElementById('upload-pdf').click()">
          + Novo PDF
        </button>
      </div>
      <div class="pdfs-grid">
        ${this.dados.pdfs.map(pdf => this.criarCardPDFGerencial(pdf)).join('')}
      </div>
    `;
  }

  criarCardPDFGerencial(pdf) {
    const nome = pdf.nome || 'PDF sem nome';
    const dataUpload = pdf.dataUpload || pdf.uploadedAt || new Date().toISOString();
    const bloqueadoIcon = pdf.bloqueado ? '🔒' : '🔓';
    const statusText = pdf.bloqueado ? 'PDF Bloqueado' : 'PDF Disponível';
    const statusClass = pdf.bloqueado ? 'status-blocked' : 'status-available';

    return `
      <div class="pdf-card-gerencial" data-pdf-id="${pdf.id}">
        <div class="pdf-header">
          <div class="pdf-icon">📄</div>
          <div class="pdf-info">
            <h4 class="pdf-name">${nome}</h4>
            <div class="pdf-status ${statusClass}">
              ${bloqueadoIcon} ${statusText}
            </div>
          </div>
        </div>
        <div class="pdf-details">
          <p><strong>📅 Upload:</strong> ${this.formatarDataSimples(dataUpload)}</p>
          <p><strong>👤 Por:</strong> ${pdf.uploadedBy || 'Sistema'}</p>
        </div>
        <div class="pdf-actions">
          <button class="btn-pdf-action" onclick="dashboardManager.visualizarPDF('${pdf.id}')" title="Visualizar">
            👁️
          </button>
          <button class="btn-pdf-action" onclick="dashboardManager.baixarPDF('${pdf.id}')" title="Baixar">
            💾
          </button>
          <button class="btn-pdf-action" onclick="dashboardManager.alternarBloqueio('${pdf.id}')" title="${pdf.bloqueado ? 'Desbloquear' : 'Bloquear'}">
            ${pdf.bloqueado ? '🔓' : '🔒'}
          </button>
          <button class="btn-pdf-action danger" onclick="dashboardManager.excluirPDF('${pdf.id}')" title="Excluir">
            🗑️
          </button>
        </div>
      </div>
    `;
  }

  renderizarArquivados() {
    const container = document.getElementById('arquivados-container');
    if (!container) return;

    if (this.dados.arquivados.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📦</div>
          <h3>Nenhum quiz arquivado</h3>
          <p>Quizzes arquivados aparecerão aqui</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="section-header">
        <h3>📦 Quizzes Arquivados (${this.dados.arquivados.length})</h3>
      </div>
      <div class="items-grid">
        ${this.dados.arquivados.map(quiz => this.criarCardArquivado(quiz)).join('')}
      </div>
    `;
  }

  criarCardArquivado(quiz) {
    const titulo = quiz.titulo || quiz.nome || 'Quiz sem título';
    const dataArquivamento = quiz.arquivadoEm || new Date().toISOString();

    return `
      <div class="item-card archived-card" data-quiz-id="${quiz.id}">
        <div class="card-header">
          <h4 class="card-title">📦 ${titulo}</h4>
          <div class="card-actions">
            <button class="btn-icon" onclick="dashboardManager.restaurarQuiz('${quiz.id}')" title="Restaurar">
              🔄
            </button>
            <button class="btn-icon danger" onclick="dashboardManager.excluirDefinitivamente('${quiz.id}')" title="Excluir Definitivamente">
              🗑️
            </button>
          </div>
        </div>
        <div class="card-body">
          <p class="card-info">📅 Arquivado em ${this.formatarDataSimples(dataArquivamento)}</p>
        </div>
      </div>
    `;
  }

  renderizarExcluidos() {
    const container = document.getElementById('excluidos-container');
    if (!container) return;

    if (this.dados.excluidos.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🗑️</div>
          <h3>Lixeira vazia</h3>
          <p>Quizzes excluídos aparecerão aqui</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="section-header">
        <h3>🗑️ Quizzes Excluídos (${this.dados.excluidos.length})</h3>
        <button class="btn btn-danger" onclick="dashboardManager.limparLixeira()">
          Esvaziar Lixeira
        </button>
      </div>
      <div class="items-grid">
        ${this.dados.excluidos.map(quiz => this.criarCardExcluido(quiz)).join('')}
      </div>
    `;
  }

  criarCardExcluido(quiz) {
    const titulo = quiz.titulo || quiz.nome || 'Quiz sem título';
    const dataExclusao = quiz.excluidoEm || new Date().toISOString();

    return `
      <div class="item-card deleted-card" data-quiz-id="${quiz.id}">
        <div class="card-header">
          <h4 class="card-title">🗑️ ${titulo}</h4>
          <div class="card-actions">
            <button class="btn-icon" onclick="dashboardManager.restaurarExcluido('${quiz.id}')" title="Restaurar">
              🔄
            </button>
          </div>
        </div>
        <div class="card-body">
          <p class="card-info">📅 Excluído em ${this.formatarDataSimples(dataExclusao)}</p>
        </div>
      </div>
    `;
  }

  atualizarEstatisticas() {
    const stats = {
      totalQuizzes: this.dados.quizzes.length,
      totalPDFs: this.dados.pdfs.length,
      totalArquivados: this.dados.arquivados.length,
      totalExcluidos: this.dados.excluidos.length,
      totalUsuarios: this.dados.usuarios.length,
      totalCadastros: this.dados.cadastros.length
    };

    // Atualizar elementos de estatística se existirem
    Object.entries(stats).forEach(([key, value]) => {
      const elemento = document.getElementById(key);
      if (elemento) {
        elemento.textContent = value;
      }
    });
  }

  // AÇÕES DO QUIZ
  async jogarQuiz(quizId) {
    try {
      const quiz = this.dados.quizzes.find(q => q.id === quizId);
      if (!quiz) {
        this.mostrarErro('Quiz não encontrado');
        return;
      }

      // Redirecionar para o player com ID do quiz
      window.location.href = `https://brainquiiz.netlify.app/quiz.html?id=${quizId}`;
      
    } catch (error) {
      console.error('Erro ao jogar quiz:', error);
      this.mostrarErro('Erro ao carregar quiz');
    }
  }

  editarQuiz(quizId) {
    const quiz = this.dados.quizzes.find(q => q.id === quizId);
    if (quiz) {
      // Passar ID do quiz na URL para edição
      window.location.href = `https://brainquiiz.netlify.app/painel.html?edit=${quizId}`;
    }
  }

  async arquivarQuiz(quizId) {
    if (!confirm('Tem certeza que deseja arquivar este quiz?')) return;

    try {
      const response = await authManager.makeAuthenticatedRequest(`${this.baseURL}/api/quiz/${quizId}/arquivar`, {
        method: 'POST'
      });

      if (response.ok) {
        await this.carregarTodosDados();
        this.mostrarSucesso('Quiz arquivado com sucesso');
      } else {
        throw new Error('Falha ao arquivar');
      }
    } catch (error) {
      console.error('Erro ao arquivar quiz:', error);
      this.mostrarErro('Erro ao arquivar quiz');
    }
  }

  async excluirQuiz(quizId) {
    if (!confirm('Tem certeza que deseja excluir este quiz? Esta ação não pode ser desfeita.')) return;

    try {
      const response = await authManager.makeAuthenticatedRequest(`${this.baseURL}/api/quiz/${quizId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        await this.carregarTodosDados();
        this.mostrarSucesso('Quiz excluído com sucesso');
      } else {
        throw new Error('Falha ao excluir');
      }
    } catch (error) {
      console.error('Erro ao excluir quiz:', error);
      this.mostrarErro('Erro ao excluir quiz');
    }
  }

  // AÇÕES DO PDF
  visualizarPDF(pdfId) {
    const pdf = this.dados.pdfs.find(p => p.id === pdfId);
    if (!pdf) {
      this.mostrarErro('PDF não encontrado');
      return;
    }

    // Abrir PDF em nova aba
    const newWindow = window.open();
    newWindow.document.write(`
      <html>
        <head>
          <title>${pdf.nome}</title>
          <style>
            body { margin: 0; padding: 0; }
            iframe { width: 100%; height: 100vh; border: none; }
          </style>
        </head>
        <body>
          <iframe src="${pdf.dados || pdf.base64}"></iframe>
        </body>
      </html>
    `);
  }

  baixarPDF(pdfId) {
    const pdf = this.dados.pdfs.find(p => p.id === pdfId);
    if (!pdf) {
      this.mostrarErro('PDF não encontrado');
      return;
    }

    if (pdf.bloqueado) {
      this.mostrarErro('Este PDF está bloqueado para download. Entre em contato com um administrador.');
      return;
    }

    try {
      const link = document.createElement('a');
      link.href = pdf.dados || pdf.base64;
      link.download = pdf.nome;
      link.click();
      
      this.mostrarSucesso('Download iniciado');
    } catch (error) {
      console.error('Erro ao baixar PDF:', error);
      this.mostrarErro('Erro ao baixar PDF');
    }
  }

  async alternarBloqueio(pdfId) {
    try {
      const pdf = this.dados.pdfs.find(p => p.id === pdfId);
      if (!pdf) {
        this.mostrarErro('PDF não encontrado');
        return;
      }

      const novoBloqueio = !pdf.bloqueado;
      const acao = novoBloqueio ? 'bloquear' : 'desbloquear';
      
      if (!confirm(`Tem certeza que deseja ${acao} este PDF?`)) return;

      const response = await authManager.makeAuthenticatedRequest(`${this.baseURL}/api/pdf/${pdfId}/bloqueio`, {
        method: 'PATCH',
        body: JSON.stringify({ bloqueado: novoBloqueio })
      });

      if (response.ok) {
        await this.carregarTodosDados();
        this.mostrarSucesso(`PDF ${acao}do com sucesso`);
      } else {
        throw new Error(`Falha ao ${acao}`);
      }
    } catch (error) {
      console.error('Erro ao alterar bloqueio:', error);
      this.mostrarErro('Erro ao alterar status do PDF');
    }
  }

  async excluirPDF(pdfId) {
    if (!confirm('Tem certeza que deseja excluir este PDF? Esta ação não pode ser desfeita.')) return;

    try {
      const response = await authManager.makeAuthenticatedRequest(`${this.baseURL}/api/pdf/${pdfId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        await this.carregarTodosDados();
        this.mostrarSucesso('PDF excluído com sucesso');
      } else {
        throw new Error('Falha ao excluir');
      }
    } catch (error) {
      console.error('Erro ao excluir PDF:', error);
      this.mostrarErro('Erro ao excluir PDF');
    }
  }

  async uploadPDF(input) {
    const file = input.files[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      this.mostrarErro('Apenas arquivos PDF são permitidos');
      return;
    }

    if (file.size > 10 * 1024 * 1024) { // 10MB
      this.mostrarErro('Arquivo muito grande. Máximo 10MB permitido');
      return;
    }

    try {
      this.mostrarCarregamento('Enviando PDF...');

      const formData = new FormData();
      formData.append('pdf', file);

      const response = await authManager.makeAuthenticatedRequest(`${this.baseURL}/api/upload-pdf`, {
        method: 'POST',
        body: formData,
        headers: {} // Remover Content-Type para FormData
      });

      if (response.ok) {
        await this.carregarTodosDados();
        this.mostrarSucesso('PDF enviado com sucesso');
        input.value = ''; // Limpar input
      } else {
        const data = await response.json();
        throw new Error(data.message || 'Falha no upload');
      }
    } catch (error) {
      console.error('Erro no upload:', error);
      this.mostrarErro(`Erro ao enviar PDF: ${error.message}`);
    } finally {
      this.esconderCarregamento();
    }
  }

  // AÇÕES DE USUÁRIOS
  async editarUsuario(usuarioId) {
    // Implementar modal de edição de usuário
    this.mostrarInfo('Funcionalidade de edição de usuário em desenvolvimento');
  }

  async alternarStatusUsuario(usuarioId) {
    try {
      const usuario = this.dados.usuarios.find(u => u.id === usuarioId);
      if (!usuario) {
        this.mostrarErro('Usuário não encontrado');
        return;
      }

      const novoStatus = !usuario.ativo;
      const acao = novoStatus ? 'ativar' : 'desativar';
      
      if (!confirm(`Tem certeza que deseja ${acao} este usuário?`)) return;

      const response = await authManager.makeAuthenticatedRequest(`${this.baseURL}/api/usuario/${usuarioId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ ativo: novoStatus })
      });

      if (response.ok) {
        await this.carregarTodosDados();
        this.mostrarSucesso(`Usuário ${acao}do com sucesso`);
      } else {
        throw new Error(`Falha ao ${acao}`);
      }
    } catch (error) {
      console.error('Erro ao alterar status do usuário:', error);
      this.mostrarErro('Erro ao alterar status do usuário');
    }
  }

  async excluirUsuario(usuarioId) {
    if (!confirm('Tem certeza que deseja excluir este usuário? Esta ação não pode ser desfeita.')) return;

    try {
      const response = await authManager.makeAuthenticatedRequest(`${this.baseURL}/api/usuario/${usuarioId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        await this.carregarTodosDados();
        this.mostrarSucesso('Usuário excluído com sucesso');
      } else {
        throw new Error('Falha ao excluir');
      }
    } catch (error) {
      console.error('Erro ao excluir usuário:', error);
      this.mostrarErro('Erro ao excluir usuário');
    }
  }

  // AÇÕES DE CADASTROS
  async aprovarCadastro(cadastroId) {
    if (!confirm('Tem certeza que deseja aprovar este cadastro?')) return;

    try {
      const response = await authManager.makeAuthenticatedRequest(`${this.baseURL}/api/cadastro/${cadastroId}/aprovar`, {
        method: 'POST'
      });

      if (response.ok) {
        await this.carregarTodosDados();
        this.mostrarSucesso('Cadastro aprovado com sucesso');
      } else {
        throw new Error('Falha ao aprovar');
      }
    } catch (error) {
      console.error('Erro ao aprovar cadastro:', error);
      this.mostrarErro('Erro ao aprovar cadastro');
    }
  }

  async rejeitarCadastro(cadastroId) {
    if (!confirm('Tem certeza que deseja rejeitar este cadastro?')) return;

    try {
      const response = await authManager.makeAuthenticatedRequest(`${this.baseURL}/api/cadastro/${cadastroId}/rejeitar`, {
        method: 'POST'
      });

      if (response.ok) {
        await this.carregarTodosDados();
        this.mostrarSucesso('Cadastro rejeitado com sucesso');
      } else {
        throw new Error('Falha ao rejeitar');
      }
    } catch (error) {
      console.error('Erro ao rejeitar cadastro:', error);
      this.mostrarErro('Erro ao rejeitar cadastro');
    }
  }

  // AÇÕES DE RESTAURAÇÃO
  async restaurarQuiz(quizId) {
    if (!confirm('Deseja restaurar este quiz?')) return;

    try {
      const response = await authManager.makeAuthenticatedRequest(`${this.baseURL}/api/quiz/${quizId}/restaurar`, {
        method: 'POST'
      });

      if (response.ok) {
        await this.carregarTodosDados();
        this.mostrarSucesso('Quiz restaurado com sucesso');
      } else {
        throw new Error('Falha ao restaurar');
      }
    } catch (error) {
      console.error('Erro ao restaurar quiz:', error);
      this.mostrarErro('Erro ao restaurar quiz');
    }
  }

  async excluirDefinitivamente(quizId) {
    if (!confirm('ATENÇÃO: Esta ação irá excluir o quiz permanentemente. Tem certeza?')) return;

    try {
      const response = await authManager.makeAuthenticatedRequest(`${this.baseURL}/api/quiz/${quizId}/definitivo`, {
        method: 'DELETE'
      });

      if (response.ok) {
        await this.carregarTodosDados();
        this.mostrarSucesso('Quiz excluído definitivamente');
      } else {
        throw new Error('Falha ao excluir definitivamente');
      }
    } catch (error) {
      console.error('Erro ao excluir definitivamente:', error);
      this.mostrarErro('Erro ao excluir quiz definitivamente');
    }
  }

  async restaurarExcluido(quizId) {
    if (!confirm('Deseja restaurar este quiz para os quizzes ativos?')) return;

    try {
      const response = await authManager.makeAuthenticatedRequest(`${this.baseURL}/api/quiz/${quizId}/restaurar-excluido`, {
        method: 'POST'
      });

      if (response.ok) {
        await this.carregarTodosDados();
        this.mostrarSucesso('Quiz restaurado com sucesso');
      } else {
        throw new Error('Falha ao restaurar');
      }
    } catch (error) {
      console.error('Erro ao restaurar quiz excluído:', error);
      this.mostrarErro('Erro ao restaurar quiz');
    }
  }

  async limparLixeira() {
    if (!confirm('ATENÇÃO: Esta ação irá excluir TODOS os quizzes da lixeira permanentemente. Tem certeza?')) return;

    try {
      const response = await authManager.makeAuthenticatedRequest(`${this.baseURL}/api/quizzes/limpar-lixeira`, {
        method: 'DELETE'
      });

      if (response.ok) {
        await this.carregarTodosDados();
        this.mostrarSucesso('Lixeira esvaziada com sucesso');
      } else {
        throw new Error('Falha ao limpar lixeira');
      }
    } catch (error) {
      console.error('Erro ao limpar lixeira:', error);
      this.mostrarErro('Erro ao esvaziar lixeira');
    }
  }

  configurarEventListeners() {
    // Configurar busca
    const campoBusca = document.getElementById('campo-busca');
    if (campoBusca) {
      campoBusca.addEventListener('input', (e) => {
        this.filtrarItens(e.target.value);
      });
    }

    // Configurar filtros de categoria
    const filtroCategoria = document.getElementById('filtro-categoria');
    if (filtroCategoria) {
      filtroCategoria.addEventListener('change', (e) => {
        this.filtrarPorCategoria(e.target.value);
      });
    }

    // Configurar botão de logout
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
      btnLogout.addEventListener('click', () => {
        if (confirm('Tem certeza que deseja sair?')) {
          authManager.logout();
        }
      });
    }

    // Configurar refresh automático a cada 5 minutos
    setInterval(() => {
      this.carregarTodosDados();
    }, 5 * 60 * 1000);
  }

  filtrarItens(termo) {
    const cards = document.querySelectorAll('.item-card, .quiz-card-ativo, .user-card-gerencial, .cadastro-card-pendente, .pdf-card-gerencial');
    termo = termo.toLowerCase();

    cards.forEach(card => {
      const titulo = card.querySelector('.card-title, .quiz-title, .user-name, .cadastro-nome, .pdf-name');
      if (titulo) {
        const matches = titulo.textContent.toLowerCase().includes(termo);
        card.style.display = matches ? 'block' : 'none';
      }
    });
  }

  filtrarPorCategoria(categoria) {
    const sections = {
      'todos': ['quizzes-container', 'pdfs-container', 'usuarios-container', 'cadastros-container', 'arquivados-container', 'excluidos-container'],
      'quizzes': ['quizzes-container'],
      'pdfs': ['pdfs-container'],
      'usuarios': ['usuarios-container'],
      'cadastros': ['cadastros-container'],
      'arquivados': ['arquivados-container'],
      'excluidos': ['excluidos-container']
    };

    // Esconder todas as seções
    Object.values(sections).flat().forEach(id => {
      const elemento = document.getElementById(id);
      if (elemento) elemento.style.display = 'none';
    });

    // Mostrar seções relevantes
    if (sections[categoria]) {
      sections[categoria].forEach(id => {
        const elemento = document.getElementById(id);
        if (elemento) elemento.style.display = 'block';
      });
    }
  }

  formatarData(isoString) {
    try {
      const data = new Date(isoString);
      return data.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      return 'Data inválida';
    }
  }

  formatarDataSimples(isoString) {
    try {
      const data = new Date(isoString);
      return data.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    } catch (error) {
      return 'Data inválida';
    }
  }

  mostrarCarregamento(mensagem = 'Carregando...') {
    const loader = document.getElementById('dashboard-loader') || document.createElement('div');
    loader.id = 'dashboard-loader';
    loader.innerHTML = `
      <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
                  background: rgba(0,0,0,0.3); display: flex; align-items: center; 
                  justify-content: center; z-index: 9999;">
        <div style="background: white; padding: 20px; border-radius: 8px; text-align: center; box-shadow: 0 4px 20px rgba(0,0,0,0.2);">
          <div style="border: 3px solid #f3f3f3; border-top: 3px solid #3498db; 
                      border-radius: 50%; width: 30px; height: 30px; 
                      animation: spin 1s linear infinite; margin: 0 auto 10px;"></div>
          <p style="color: #333; margin: 0;">${mensagem}</p>
        </div>
      </div>
      <style>
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      </style>
    `;
    
    if (!document.getElementById('dashboard-loader')) {
      document.body.appendChild(loader);
    }
  }

  esconderCarregamento() {
    const loader = document.getElementById('dashboard-loader');
    if (loader) {
      loader.remove();
    }
  }

  mostrarSucesso(mensagem) {
    this.mostrarNotificacao(mensagem, 'success');
  }

  mostrarErro(mensagem) {
    this.mostrarNotificacao(mensagem, 'error');
  }

  mostrarInfo(mensagem) {
    this.mostrarNotificacao(mensagem, 'info');
  }

  mostrarNotificacao(mensagem, tipo = 'info') {
    const cores = {
      success: { bg: '#d4edda', border: '#c3e6cb', text: '#155724' },
      error: { bg: '#f8d7da', border: '#f5c6cb', text: '#721c24' },
      info: { bg: '#d1ecf1', border: '#bee5eb', text: '#0c5460' }
    };

    const cor = cores[tipo] || cores.info;

    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10000;
      padding: 15px 20px;
      background: ${cor.bg};
      color: ${cor.text};
      border: 1px solid ${cor.border};
      border-radius: 5px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      max-width: 400px;
      opacity: 0;
      transform: translateX(100%);
      transition: all 0.3s ease;
    `;

    notification.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between;">
        <span>${mensagem}</span>
        <button onclick="this.parentElement.parentElement.remove()" style="
          background: none; border: none; font-size: 18px; cursor: pointer;
          color: ${cor.text}; margin-left: 10px; padding: 0; line-height: 1;">×</button>
      </div>
    `;

    document.body.appendChild(notification);

    // Animar entrada
    setTimeout(() => {
      notification.style.opacity = '1';
      notification.style.transform = 'translateX(0)';
    }, 10);

    // Auto-remover após 5 segundos
    setTimeout(() => {
      if (notification.parentElement) {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => notification.remove(), 300);
      }
    }, 5000);
  }
}

// Instância global
window.dashboardManager = new DashboardManager();

// Inicializar quando a página carregar
document.addEventListener('DOMContentLoaded', () => {
  if (window.location.pathname.includes('dashboard.html')) {
    dashboardManager.inicializar();
  }
});

console.log('✅ DashboardManager COMPLETO - APENAS DADOS REAIS!');
