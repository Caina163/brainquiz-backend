class LoginManager {
  constructor() {
    this.form = null;
    this.tentativasLogin = 0;
    this.maxTentativas = 5;
    this.bloqueioTempo = 15 * 60 * 1000; // 15 minutos
  }

  inicializar() {
    this.form = document.getElementById('loginForm');
    if (!this.form) {
      console.error('Formulário de login não encontrado');
      return;
    }

    this.configurarEventListeners();
    this.verificarBloqueio();
    this.verificarUsuarioJaLogado();
  }

  configurarEventListeners() {
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.processarLogin();
    });

    // Limpar mensagens de erro quando usuário começar a digitar
    const inputs = this.form.querySelectorAll('input');
    inputs.forEach(input => {
      input.addEventListener('input', () => {
        this.limparErros();
      });
    });

    // Permitir Enter para submeter
    inputs.forEach(input => {
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          this.processarLogin();
        }
      });
    });
  }

  async verificarUsuarioJaLogado() {
    try {
      const usuarioLogado = await authManager.getUsuarioAtual();
      if (usuarioLogado) {
        console.log('✅ Usuário já está logado, redirecionando...');
        window.location.href = 'https://brainquiz-wel0.onrender.com/dashboard.html';
      }
    } catch (error) {
      console.log('Usuário não está logado, permanecer na tela de login');
    }
  }

  verificarBloqueio() {
    const ultimoBloqueio = localStorage.getItem('ultimoBloqueioLogin');
    if (ultimoBloqueio) {
      const tempoRestante = parseInt(ultimoBloqueio) + this.bloqueioTempo - Date.now();
      if (tempoRestante > 0) {
        this.bloquearFormulario(tempoRestante);
        return true;
      } else {
        // Bloqueio expirou, limpar dados
        localStorage.removeItem('ultimoBloqueioLogin');
        localStorage.removeItem('tentativasLogin');
      }
    }
    
    this.tentativasLogin = parseInt(localStorage.getItem('tentativasLogin') || '0');
    return false;
  }

  async processarLogin() {
    if (this.verificarBloqueio()) {
      return;
    }

    // Obter dados do formulário
    const formData = new FormData(this.form);
    const usuario = formData.get('usuario')?.trim();
    const senha = formData.get('senha')?.trim();

    // Validar campos
    if (!this.validarCampos(usuario, senha)) {
      return;
    }

    try {
      this.mostrarCarregamento();
      
      // Tentar fazer login
      const resultado = await authManager.login(usuario, senha);
      
      if (resultado.success) {
        this.limparTentativas();
        this.mostrarSucesso('Login realizado com sucesso! Redirecionando...');
        
        // Pequeno delay para mostrar sucesso antes de redirecionar
        setTimeout(() => {
          window.location.href = 'https://brainquiz-wel0.onrender.com/dashboard.html';
        }, 1500);
        
      } else {
        this.tratarErroLogin(resultado.message);
      }
      
    } catch (error) {
      console.error('Erro no processo de login:', error);
      this.tratarErroLogin('Erro de conexão. Verifique sua internet e tente novamente.');
    } finally {
      this.esconderCarregamento();
    }
  }

  validarCampos(usuario, senha) {
    this.limparErros();
    let valido = true;

    if (!usuario) {
      this.mostrarErro('Por favor, digite seu usuário', 'usuario');
      valido = false;
    }

    if (!senha) {
      this.mostrarErro('Por favor, digite sua senha', 'senha');
      valido = false;
    }

    if (usuario && usuario.length < 3) {
      this.mostrarErro('Usuário deve ter pelo menos 3 caracteres', 'usuario');
      valido = false;
    }

    if (senha && senha.length < 6) {
      this.mostrarErro('Senha deve ter pelo menos 6 caracteres', 'senha');
      valido = false;
    }

    return valido;
  }

  tratarErroLogin(mensagem) {
    this.tentativasLogin++;
    localStorage.setItem('tentativasLogin', this.tentativasLogin.toString());

    if (this.tentativasLogin >= this.maxTentativas) {
      // Bloquear por 15 minutos
      localStorage.setItem('ultimoBloqueioLogin', Date.now().toString());
      this.bloquearFormulario(this.bloqueioTempo);
      this.mostrarErro(`Muitas tentativas falharam. Tente novamente em 15 minutos.`);
    } else {
      const tentativasRestantes = this.maxTentativas - this.tentativasLogin;
      this.mostrarErro(`${mensagem} (${tentativasRestantes} tentativas restantes)`);
    }
  }

  bloquearFormulario(tempoMs) {
    const inputs = this.form.querySelectorAll('input, button');
    inputs.forEach(input => {
      input.disabled = true;
    });

    this.atualizarContadorBloqueio(tempoMs);
  }

  atualizarContadorBloqueio(tempoMs) {
    const minutos = Math.ceil(tempoMs / (60 * 1000));
    
    const contador = document.createElement('div');
    contador.id = 'contador-bloqueio';
    contador.className = 'alert alert-warning';
    contador.innerHTML = `
      ⏰ Conta temporariamente bloqueada. 
      Tente novamente em <span id="tempo-restante">${minutos}</span> minuto(s).
    `;

    // Inserir contador no formulário
    this.form.insertBefore(contador, this.form.firstChild);

    // Atualizar contador a cada minuto
    const intervalId = setInterval(() => {
      const ultimoBloqueio = localStorage.getItem('ultimoBloqueioLogin');
      if (!ultimoBloqueio) {
        clearInterval(intervalId);
        this.desbloquearFormulario();
        return;
      }

      const tempoRestante = parseInt(ultimoBloqueio) + this.bloqueioTempo - Date.now();
      if (tempoRestante <= 0) {
        clearInterval(intervalId);
        this.desbloquearFormulario();
      } else {
        const minutosRestantes = Math.ceil(tempoRestante / (60 * 1000));
        const elementoTempo = document.getElementById('tempo-restante');
        if (elementoTempo) {
          elementoTempo.textContent = minutosRestantes;
        }
      }
    }, 60000); // Verificar a cada minuto
  }

  desbloquearFormulario() {
    const inputs = this.form.querySelectorAll('input, button');
    inputs.forEach(input => {
      input.disabled = false;
    });

    const contador = document.getElementById('contador-bloqueio');
    if (contador) {
      contador.remove();
    }

    localStorage.removeItem('ultimoBloqueioLogin');
    localStorage.removeItem('tentativasLogin');
    this.tentativasLogin = 0;

    this.mostrarSucesso('Conta desbloqueada. Você pode tentar fazer login novamente.');
  }

  limparTentativas() {
    this.tentativasLogin = 0;
    localStorage.removeItem('tentativasLogin');
    localStorage.removeItem('ultimoBloqueioLogin');
  }

  mostrarErro(mensagem, campo = null) {
    // Remover erros anteriores
    this.limparErros();

    // Criar elemento de erro
    const erro = document.createElement('div');
    erro.className = 'alert alert-danger';
    erro.innerHTML = `
      <i class="fas fa-exclamation-triangle"></i>
      ${mensagem}
    `;

    if (campo) {
      // Mostrar erro específico do campo
      const input = this.form.querySelector(`[name="${campo}"]`);
      if (input) {
        input.classList.add('is-invalid');
        input.parentElement.appendChild(erro);
      }
    } else {
      // Mostrar erro geral
      this.form.insertBefore(erro, this.form.firstChild);
    }
  }

  mostrarSucesso(mensagem) {
    this.limparErros();
    
    const sucesso = document.createElement('div');
    sucesso.className = 'alert alert-success';
    sucesso.innerHTML = `
      <i class="fas fa-check-circle"></i>
      ${mensagem}
    `;
    
    this.form.insertBefore(sucesso, this.form.firstChild);
  }

  limparErros() {
    // Remover alertas
    const alertas = this.form.querySelectorAll('.alert-danger, .alert-success');
    alertas.forEach(alerta => alerta.remove());

    // Remover classes de erro dos inputs
    const inputs = this.form.querySelectorAll('.is-invalid');
    inputs.forEach(input => input.classList.remove('is-invalid'));
  }

  mostrarCarregamento() {
    const botao = this.form.querySelector('button[type="submit"]');
    if (botao) {
      botao.disabled = true;
      botao.innerHTML = `
        <span class="spinner-border spinner-border-sm" role="status"></span>
        Entrando...
      `;
    }
  }

  esconderCarregamento() {
    const botao = this.form.querySelector('button[type="submit"]');
    if (botao) {
      botao.disabled = false;
      botao.innerHTML = 'Entrar';
    }
  }
}

// Instância global
window.loginManager = new LoginManager();

// Inicializar quando a página carregar
document.addEventListener('DOMContentLoaded', () => {
  if (window.location.pathname.includes('login.html') || window.location.pathname === '/') {
    loginManager.inicializar();
  }
});

console.log('✅ LoginManager conectado ao Render: https://brainquiz-wel0.onrender.com');
