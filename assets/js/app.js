const { createApp, reactive, computed, watch, ref, onMounted, onBeforeUnmount, nextTick } = Vue;

import { DEFAULT_SETTINGS, DEFAULT_REMINDERS, BASE_STORAGE_KEY } from './modules/constants.js';
import { loadFromStorage, saveToStorage, mergeSettings } from './modules/utils/storage.js';
import { createFormatters } from './modules/utils/formatters.js';
import { parseInput, parsePercent } from './modules/utils/parsers.js';
import { createDataHandlers } from './modules/services/dataHandlers.js';

const PERCENT_SUGGESTIONS = Object.freeze([
  { label: '0 %', value: 0 },
  { label: '2 %', value: 2 },
  { label: '5 %', value: 5 },
  { label: '10 %', value: 10 },
  { label: '15 %', value: 15 },
  { label: '20 %', value: 20 }
]);

const template = document.getElementById('app-template').innerHTML;

createApp({
  template,
  setup() {
    const fecha = ref(new Date().toISOString().slice(0, 10));
    const categorias = reactive([]);
    const productos = reactive([]);

    const hydrateCollection = (target, source) => {
      if (!Array.isArray(source)) {
        return;
      }
      source.forEach((item) => {
        if (item && typeof item === 'object') {
          target.push({ ...item });
        }
      });
    };

    const storedBase = loadFromStorage(BASE_STORAGE_KEY, null);
    if (storedBase && typeof storedBase === 'object') {
      hydrateCollection(categorias, storedBase.categorias);
      hydrateCollection(productos, storedBase.productos);
    }

    let basePersistTimer = null;
    let basePersistenceEnabled = false;

    const clearBaseTimer = () => {
      if (basePersistTimer) {
        window.clearTimeout(basePersistTimer);
        basePersistTimer = null;
      }
    };

    const snapshotBase = () => ({
      categorias: categorias.map((categoria) => ({ ...categoria })),
      productos: productos.map((producto) => ({ ...producto }))
    });

    const persistBase = () => {
      if (!basePersistenceEnabled) {
        return;
      }
      saveToStorage(BASE_STORAGE_KEY, snapshotBase());
    };

    const schedulePersistBase = () => {
      if (!basePersistenceEnabled) {
        return;
      }
      clearBaseTimer();
      basePersistTimer = window.setTimeout(() => {
        basePersistTimer = null;
        persistBase();
      }, 150);
    };

    const disableBasePersistence = () => {
      basePersistenceEnabled = false;
      clearBaseTimer();
    };

    const enableBasePersistence = () => {
      basePersistenceEnabled = true;
    };

    const storedSettings = loadFromStorage('settings', DEFAULT_SETTINGS);
    const settings = reactive(mergeSettings(DEFAULT_SETTINGS, storedSettings));

    if (!settings.reminders || typeof settings.reminders !== 'object') {
      settings.reminders = { ...DEFAULT_SETTINGS.reminders };
    }

    watch(settings, (value) => saveToStorage('settings', value), { deep: true });

    watch(categorias, schedulePersistBase, { deep: true });
    watch(productos, schedulePersistBase, { deep: true });

    enableBasePersistence();

    watch(
      () => settings.font,
      (value) => {
        document.documentElement.style.setProperty('--font-scale', value);
      },
      { immediate: true }
    );

    watch(
      () => settings.reminders?.duration,
      (value) => {
        const fallback = DEFAULT_SETTINGS.reminders.duration;
        const numeric = Number.parseFloat(value);
        const sanitized = Number.isFinite(numeric) && numeric > 0 ? Number(numeric.toFixed(1)) : fallback;
        if (!settings.reminders) {
          settings.reminders = { duration: sanitized };
          return;
        }
        if (settings.reminders.duration !== sanitized) {
          settings.reminders.duration = sanitized;
        }
      },
      { immediate: true }
    );

    const reminders = reactive(loadFromStorage('reminders', DEFAULT_REMINDERS));
    watch(reminders, (value) => saveToStorage('reminders', value), { deep: true });

    const newReminder = ref('');
    const filtroCat = ref('todos');
    const search = ref('');
    const priceMin = ref(null);
    const priceMax = ref(null);
    const priceMinText = ref('');
    const priceMaxText = ref('');

    const modoEdicion = ref(false);
    const showConfig = ref(false);
    const showDetalle = ref(false);
    const showPago = ref(false);
    const showProvincias = ref(false);
    const showRequisitos = ref(false);
    const showRedes = ref(false);
    const showResetConfirm = ref(false);

    const selectedProd = ref({});

    const suggestionsMin = ref([]);
    const suggestionsMax = ref([]);
    const suggestionsMonto = ref([]);
    const suggestionsMargen = ref([]);

    const focused = ref(null);
    const sortKey = ref(null);
    const sortDir = ref(1);

    const pagoMonto = ref(null);
    const pagoMontoText = ref('');
    const pagoTipo = ref('di');
    const pagoMargen = ref(5);
    const pagoMargenText = ref('5');
    const resultadosPago = ref([]);
    const buscado = ref(false);

    const remindersInterval = ref(null);
    const reminderPlaying = ref(true);

    const notifications = ref([]);
    const notificationTimers = new Map();
    const defaultNotificationTitles = Object.freeze({
      success: 'Operación exitosa',
      error: 'Algo salió mal',
      info: 'Información',
      warning: 'Aviso importante'
    });
    const notificationIcons = Object.freeze({
      success: 'fa-circle-check',
      error: 'fa-circle-xmark',
      info: 'fa-circle-info',
      warning: 'fa-triangle-exclamation'
    });

    const stopReminderCycle = () => {
      if (remindersInterval.value) {
        window.clearInterval(remindersInterval.value);
        remindersInterval.value = null;
      }
    };

    const cycleReminder = (direction = 1) => {
      const length = reminders.length;
      if (!length) {
        currentRemIndex.value = 0;
        return;
      }
      const nextIndex = (currentRemIndex.value + direction + length) % length;
      currentRemIndex.value = nextIndex;
    };

    const autoAdvanceReminder = () => cycleReminder(1);

    const startReminderCycle = () => {
      stopReminderCycle();
      if (!reminderPlaying.value || !reminders.length) {
        return;
      }
      remindersInterval.value = window.setInterval(autoAdvanceReminder, reminderDurationMs.value);
    };

    const nextReminder = () => {
      cycleReminder(1);
      if (reminderPlaying.value) {
        startReminderCycle();
      }
    };

    const prevReminder = () => {
      cycleReminder(-1);
      if (reminderPlaying.value) {
        startReminderCycle();
      }
    };

    const toggleReminderPlayback = () => {
      reminderPlaying.value = !reminderPlaying.value;
    };

    const redes = reactive([
      {
        id: 'whatsapp',
        name: 'WhatsApp',
        description: 'Contacto directo con la sucursal.',
        url: 'https://wa.me/5491171531689',
        display: 'wa.me/5491171531689',
        icon: 'fa-whatsapp',
        iconPrefix: 'fa-brands',
        gradient: 'linear-gradient(135deg, #22c55e, #16a34a)'
      },
      {
        id: 'instagram',
        name: 'Instagram',
        description: 'Seguinos para conocer todas las promos.',
        url: 'https://www.instagram.com/promosautocredito/',
        display: 'instagram.com/promosautocredito',
        icon: 'fa-instagram',
        iconPrefix: 'fa-brands',
        gradient: 'linear-gradient(135deg, #ec4899, #a855f7)'
      },
      {
        id: 'facebook',
        name: 'Facebook',
        description: 'Contenido actualizado para compartir con clientes.',
        url: 'https://www.facebook.com/share/1BTUC9KkVi/',
        display: 'facebook.com/share/1BTUC9KkVi/',
        icon: 'fa-facebook',
        iconPrefix: 'fa-brands',
        gradient: 'linear-gradient(135deg, #2563eb, #1d4ed8)'
      },
      {
        id: 'web',
        name: 'Página Oficial de Autocredito',
        description: 'Sitio oficial para validar información con clientes.',
        url: 'https://www.autocredito.com/',
        display: 'autocredito.com',
        icon: 'fa-globe',
        iconPrefix: 'fa-solid',
        gradient: 'linear-gradient(135deg, #14b8a6, #0ea5e9)'
      },
      {
        id: 'sucursal',
        name: 'Nuestra Sucursal',
        description: 'Dirección y horarios de atención en Puerto Madero.',
        url: 'https://www.google.com/maps/search/?api=1&query=MOREAU+DE+JUSTO+1930+Puerto+Madero',
        display:
          'Capital Federal, Capital Federal<br>Agencia Oficial Puerto Madero<br>Moreau de Justo 1930<br>Lun a Vie de 10:00 a 18:00 hs',
        icon: 'fa-location-dot',
        iconPrefix: 'fa-solid',
        gradient: 'linear-gradient(135deg, #f97316, #fb7185)'
      }
    ]);

    const credenciales = reactive([
      {
        id: 'drive',
        name: 'Drive del Grupo',
        subtitle: 'Cuenta Google compartida',
        user: 'promosautocredito@gmail.com',
        password: 'puertomadero',
        icon: 'fa-google-drive',
        iconPrefix: 'fa-brands',
        gradient: 'linear-gradient(135deg, #0ea5e9, #6366f1)',
        revealed: false
      },
      {
        id: 'facebook-group',
        name: 'Facebook del Grupo',
        subtitle: 'Acceso administrativo',
        user: '1171531689',
        password: 'puertomadero2025',
        icon: 'fa-facebook',
        iconPrefix: 'fa-brands',
        gradient: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
        revealed: false
      },
      {
        id: 'instagram-group',
        name: 'Instagram del Grupo',
        subtitle: 'Gestión de publicaciones',
        user: '1171531689',
        password: 'puertomadero',
        icon: 'fa-instagram',
        iconPrefix: 'fa-brands',
        gradient: 'linear-gradient(135deg, #ec4899, #d946ef)',
        revealed: false
      }
    ]);

    const { fmt } = createFormatters(settings);

    const editingRow = ref(null);

    const currentRemIndex = ref(0);
    const currentReminder = computed(() => (reminders.length ? reminders[currentRemIndex.value] : ''));
    const reminderDurationMs = computed(() => {
      const fallback = DEFAULT_SETTINGS.reminders.duration;
      const duration = Number.parseFloat(settings.reminders?.duration ?? fallback);
      const valid = Number.isFinite(duration) && duration > 0 ? duration : fallback;
      return valid * 1000;
    });
    const isBaseLoaded = computed(() => productos.length > 0);

    watch(isBaseLoaded, (loaded) => {
      if (loaded) {
        return;
      }
      showDetalle.value = false;
      showPago.value = false;
      modoEdicion.value = false;
      editingRow.value = null;
      selectedProd.value = {};
      filtroCat.value = 'todos';
      search.value = '';
      priceMin.value = null;
      priceMax.value = null;
      priceMinText.value = '';
      priceMaxText.value = '';
      suggestionsMin.value = [];
      suggestionsMax.value = [];
      focused.value = null;
      pagoMonto.value = null;
      pagoMontoText.value = '';
      suggestionsMonto.value = [];
      pagoMargen.value = 5;
      pagoMargenText.value = '5';
      suggestionsMargen.value = [];
      resultadosPago.value = [];
      buscado.value = false;
    });
    const visibleColumnCount = computed(() => {
      let total = 8;
      if (settings.hidden?.categoria) {
        total -= 1;
      }
      if (settings.hidden?.codigo) {
        total -= 1;
      }
      if (modoEdicion.value) {
        total += 1;
      }
      return total;
    });

    const generateId = (() => {
      let fallbackCounter = 0;
      return () => {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') {
          try {
            return window.crypto.randomUUID();
          } catch (error) {
            // fallback handled below
          }
        }
        fallbackCounter = (fallbackCounter + 1) % Number.MAX_SAFE_INTEGER;
        const timestamp = Date.now().toString(16);
        const random = Math.floor(Math.random() * 0xffffffff).toString(16);
        return `id-${timestamp}-${random}-${fallbackCounter.toString(16)}`;
      };
    })();

    const dataHandlers = createDataHandlers({
      categorias,
      productos,
      generateId,
      getSettings: () => settings,
      onDataChange: schedulePersistBase
    });

    const catNombre = (id) => categorias.find((categoria) => categoria.id === id)?.nombre || '';

    const productosFiltrados = computed(() =>
      productos.filter((producto) => {
        if (filtroCat.value !== 'todos' && producto.categoriaId !== filtroCat.value) {
          return false;
        }
        if (search.value) {
          const term = search.value.toLowerCase();
          const nombre = (producto.nombre || '').toLowerCase();
          if (!nombre.includes(term) && !String(producto.codigo || '').includes(term)) {
            return false;
          }
        }
        if (priceMin.value != null && producto.valorNominal < priceMin.value) {
          return false;
        }
        if (priceMax.value != null && producto.valorNominal > priceMax.value) {
          return false;
        }
        return true;
      })
    );

    const productosOrdenados = computed(() => {
      const listado = [...productosFiltrados.value];
      if (!sortKey.value) {
        return listado;
      }
      const valueOf = (producto, key) => {
        if (key === 'cat') {
          return catNombre(producto.categoriaId);
        }
        if (key === 'cod') {
          return producto.codigo;
        }
        if (key === 'nom') {
          return (producto.nombre || '').toLowerCase();
        }
        if (key === 'val') {
          return producto.valorNominal;
        }
        if (key === 'sus') {
          return producto.suscripcion;
        }
        if (key === 'c17') {
          return producto.cuota17;
        }
        if (key === 'c8') {
          return producto.cuota8mas;
        }
        if (key === 'der') {
          return producto.derechoIngreso;
        }
        return '';
      };
      listado.sort((a, b) => {
        const valueA = valueOf(a, sortKey.value);
        const valueB = valueOf(b, sortKey.value);
        if (valueA == null) {
          return 1;
        }
        if (valueB == null) {
          return -1;
        }
        if (typeof valueA === 'number' && typeof valueB === 'number') {
          return sortDir.value * (valueA - valueB);
        }
        return sortDir.value * String(valueA).localeCompare(String(valueB));
      });
      return listado;
    });

    const notificationIcon = (type) => notificationIcons[type] || notificationIcons.info;

    const addNotification = (message, options = {}) => {
      const type = options.type || 'info';
      const id = crypto.randomUUID();
      const title = options.title || defaultNotificationTitles[type] || defaultNotificationTitles.info;
      const formattedMessage = String(message ?? '')
        .replace(/\r\n/g, '\n')
        .replace(/\n/g, '<br>');
      notifications.value.push({ id, type, title, message: formattedMessage });
      const duration = Number.isFinite(options.duration) ? options.duration : 5000;
      if (duration > 0) {
        const timeout = window.setTimeout(() => dismissNotification(id), duration);
        notificationTimers.set(id, timeout);
      }
    };

    const dismissNotification = (id) => {
      const index = notifications.value.findIndex((notification) => notification.id === id);
      if (index > -1) {
        notifications.value.splice(index, 1);
      }
      if (notificationTimers.has(id)) {
        window.clearTimeout(notificationTimers.get(id));
        notificationTimers.delete(id);
      }
    };

    const maskSecret = (value = '') =>
      Array.from(String(value)).map((char) => (char === ' ' ? ' ' : '•')).join('');

    const secretValue = (credencial) => (credencial.revealed ? credencial.password : maskSecret(credencial.password));

    const toggleCredential = (id) => {
      const credencial = credenciales.find((item) => item.id === id);
      if (credencial) {
        credencial.revealed = !credencial.revealed;
      }
    };

    watch(
      () => reminders.length,
      (length) => {
        if (!length) {
          currentRemIndex.value = 0;
          stopReminderCycle();
          return;
        }
        if (currentRemIndex.value >= length) {
          currentRemIndex.value = 0;
        }
        if (reminderPlaying.value) {
          startReminderCycle();
        }
      }
    );

    watch(
      () => reminderDurationMs.value,
      () => {
        if (reminderPlaying.value && reminders.length) {
          startReminderCycle();
        }
      }
    );

    watch(
      () => reminderPlaying.value,
      (playing) => {
        if (playing) {
          startReminderCycle();
        } else {
          stopReminderCycle();
        }
      }
    );

    const ensureClipboard = () => {
      if (!navigator.clipboard) {
        addNotification('La función de copiado no está disponible en este navegador.', {
          type: 'warning',
          title: 'Copiado no disponible'
        });
        return false;
      }
      return true;
    };

    const copyLink = async (url, label) => {
      if (!ensureClipboard()) {
        return;
      }
      try {
        await navigator.clipboard.writeText(url);
        addNotification(`${label} listo para compartir.`, {
          type: 'success',
          title: 'Enlace copiado'
        });
      } catch (error) {
        addNotification('No fue posible copiar el enlace. Intenta nuevamente.', {
          type: 'error',
          title: 'Acción no completada'
        });
      }
    };

    const copyCredential = async (id, field) => {
      if (!ensureClipboard()) {
        return;
      }
      const credencial = credenciales.find((item) => item.id === id);
      if (!credencial) {
        return;
      }
      const value = field === 'password' ? credencial.password : credencial.user;
      const label = field === 'password' ? 'Contraseña' : 'Usuario';
      try {
        await navigator.clipboard.writeText(value);
        addNotification(`${label} de ${credencial.name} copiado correctamente.`, {
          type: 'success',
          title: 'Dato copiado'
        });
      } catch (error) {
        addNotification('No fue posible copiar el dato. Intenta nuevamente.', {
          type: 'error',
          title: 'Acción no completada'
        });
      }
    };

    const openResetDialog = () => {
      showResetConfirm.value = true;
    };

    const cancelReset = () => {
      showResetConfirm.value = false;
    };

    const confirmReset = () => {
      stopReminderCycle();
      disableBasePersistence();
      localStorage.removeItem('settings');
      localStorage.removeItem('reminders');
      localStorage.removeItem(BASE_STORAGE_KEY);
      settings.dec = DEFAULT_SETTINGS.dec;
      settings.simple = DEFAULT_SETTINGS.simple;
      settings.font = DEFAULT_SETTINGS.font;
      settings.hidden = { ...DEFAULT_SETTINGS.hidden };
      settings.col = {};
      settings.reminders = { ...DEFAULT_SETTINGS.reminders };
      reminders.splice(0, reminders.length, ...DEFAULT_REMINDERS);
      categorias.splice(0, categorias.length);
      productos.splice(0, productos.length);
      filtroCat.value = 'todos';
      search.value = '';
      priceMin.value = null;
      priceMax.value = null;
      priceMinText.value = '';
      priceMaxText.value = '';
      suggestionsMin.value = [];
      suggestionsMax.value = [];
      suggestionsMonto.value = [];
      suggestionsMargen.value = [];
      focused.value = null;
      sortKey.value = null;
      sortDir.value = 1;
      modoEdicion.value = false;
      editingRow.value = null;
      pagoMonto.value = null;
      pagoMontoText.value = '';
      pagoTipo.value = 'di';
      pagoMargen.value = 5;
      pagoMargenText.value = '5';
      resultadosPago.value = [];
      buscado.value = false;
      selectedProd.value = {};
      currentRemIndex.value = 0;
      reminderPlaying.value = true;
      showDetalle.value = false;
      showPago.value = false;
      showProvincias.value = false;
      showRequisitos.value = false;
      showRedes.value = false;
      showConfig.value = false;
      showResetConfirm.value = false;
      enableBasePersistence();
      startReminderCycle();
      addNotification('Configuración restablecida a valores de fábrica.', {
        type: 'success',
        title: 'Sitio restaurado'
      });
    };

    const formatPrice = (type) => {
      const text = type === 'min' ? priceMinText.value : priceMaxText.value;
      const { value, suggestions } = parseInput(text);
      if (type === 'min') {
        priceMin.value = value;
        suggestionsMin.value = suggestions;
      } else {
        priceMax.value = value;
        suggestionsMax.value = suggestions;
      }
    };

    const formatMonto = () => {
      const { value, suggestions } = parseInput(pagoMontoText.value);
      pagoMonto.value = value;
      suggestionsMonto.value = suggestions;
    };

    const formatMargen = () => {
      const value = parsePercent(pagoMargenText.value);
      pagoMargen.value = typeof value === 'number' ? value : 0;
      suggestionsMargen.value = PERCENT_SUGGESTIONS;
    };

    const selectSuggestion = (type, value) => {
      if (type === 'min') {
        priceMin.value = value;
        priceMinText.value = value.toLocaleString('es-AR');
        suggestionsMin.value = [];
      } else if (type === 'max') {
        priceMax.value = value;
        priceMaxText.value = value.toLocaleString('es-AR');
        suggestionsMax.value = [];
      } else if (type === 'monto') {
        pagoMonto.value = value;
        pagoMontoText.value = value.toLocaleString('es-AR');
        suggestionsMonto.value = [];
      } else if (type === 'margen') {
        pagoMargen.value = value;
        pagoMargenText.value = String(value);
        suggestionsMargen.value = [];
      }
    };

    const hideSuggestions = () => {
      window.setTimeout(() => {
        focused.value = null;
      }, 150);
    };

    const changeFont = (delta) => {
      const next = Math.min(Math.max(0.8, settings.font + delta), 1.4);
      settings.font = Number(next.toFixed(2));
    };

    const toggleModoEdicion = (event) => {
      if (event.target.checked) {
        const confirmed = window.confirm(
          'Ten en cuenta que la modificación de datos no es recomendable. Los datos se cargan automáticamente con el JSON convertido de los archivos XLSX proporcionados mensualmente. Procede con precaución.'
        );
        if (!confirmed) {
          modoEdicion.value = false;
          return;
        }
      } else {
        editingRow.value = null;
      }
    };

    const addReminder = () => {
      const text = newReminder.value.trim();
      if (!text) {
        return;
      }
      reminders.push(text);
      newReminder.value = '';
      currentRemIndex.value = reminders.length - 1;
      if (reminderPlaying.value) {
        startReminderCycle();
      }
    };

    const sort = (key) => {
      if (sortKey.value === key) {
        sortDir.value *= -1;
      } else {
        sortKey.value = key;
        sortDir.value = 1;
      }
    };

    const edit = (producto) => {
      if (editingRow.value === producto.id) {
        editingRow.value = null;
      } else {
        editingRow.value = producto.id;
      }
    };

    const delProd = (id) => {
      if (!window.confirm('¿Seguro que deseas borrar este producto?')) {
        return;
      }
      dataHandlers.deleteProduct(id);
    };

    const mostrarDetalle = (producto) => {
      selectedProd.value = producto;
      showDetalle.value = true;
      showPago.value = false;
    };

    const colStyle = (key) => (settings.col[key] ? { width: `${settings.col[key]}px` } : {});

    const buscarOpcionesPago = () => {
      buscado.value = true;
      resultadosPago.value = [];
      if (pagoMonto.value == null || pagoMonto.value <= 0) {
        return;
      }
      const margen = Number.isNaN(pagoMargen.value) ? 0 : pagoMargen.value;
      const rangoInferior = pagoMonto.value * (1 - margen / 100);
      const rangoSuperior = pagoMonto.value * (1 + margen / 100);

      productos.forEach((producto) => {
        let valor = 0;
        if (pagoTipo.value === 'di') {
          valor = producto.derechoIngreso || 0;
        } else {
          const cuota17 = producto.cuota17 || 0;
          const cuota8mas = producto.cuota8mas || 0;
          valor = cuota17 && cuota8mas ? Math.min(cuota17, cuota8mas) : cuota17 || cuota8mas;
        }
        if (valor && valor >= rangoInferior && valor <= rangoSuperior) {
          resultadosPago.value.push({
            ...producto,
            valorMatch: valor,
            tipoRef: pagoTipo.value === 'di' ? 'Derecho Ingreso' : 'Cuota'
          });
        }
      });
      resultadosPago.value.sort((a, b) => a.valorMatch - b.valorMatch);
    };

    const handlePlanillaUpload = async (event) => {
      const files = event.target.files;
      event.target.value = '';
      if (!files || !files.length) {
        return;
      }
      const { imported, errors, added } = await dataHandlers.importPlanillas(files);
      if (imported) {
        if (added > 0) {
          const planillasLabel = imported === 1 ? 'planilla procesada' : `${imported} planillas procesadas`;
          const productosLabel = added === 1 ? '1 producto' : `${added} productos`;
          addNotification(`${planillasLabel}. Se incorporaron ${productosLabel}.`, {
            type: 'success',
            title: 'Carga completada'
          });
        } else {
          const message = imported === 1
            ? 'La planilla seleccionada no contenía registros nuevos.'
            : 'Las planillas seleccionadas no contenían registros nuevos.';
          addNotification(message, {
            type: 'info',
            title: 'Sin cambios detectados'
          });
        }
      }
      if (errors.length) {
        addNotification(errors.join('\n'), {
          type: 'error',
          title: 'Errores detectados'
        });
      }
    };

    const handleBaseUpload = async (event) => {
      const [file] = event.target.files || [];
      event.target.value = '';
      if (!file) {
        return;
      }
      if (!window.confirm('Esto reemplazará la base actual. ¿Continuar?')) {
        return;
      }
      const { success, error, categorias: categoriasCount, productos: productosCount } = await dataHandlers.importBase(file);
      if (success) {
        const detalleCategorias = categoriasCount === 1 ? '1 categoría' : `${categoriasCount} categorías`;
        const detalleProductos = productosCount === 1 ? '1 producto' : `${productosCount} productos`;
        addNotification(`Base reemplazada correctamente (${detalleCategorias}, ${detalleProductos}).`, {
          type: 'success',
          title: 'Base actualizada'
        });
      } else if (error) {
        addNotification(`Error al importar base: ${error}`, {
          type: 'error',
          title: 'Error en la importación'
        });
      }
    };

    const exportJSON = () => {
      dataHandlers.exportBase();
      addNotification('Exportación generada correctamente.', {
        type: 'success',
        title: 'Archivo listo'
      });
    };

    let beforeUnloadHandler = null;

    onMounted(() => {
      addNotification('Sistema inicializado correctamente.', {
        type: 'success',
        title: 'Bienvenido'
      });

      startReminderCycle();

      beforeUnloadHandler = (event) => {
        persistBase();
        event.preventDefault();
        event.returnValue = 'Estás por refrescar la página. Los cambios no guardados se perderán. Presiona Cancelar para permanecer.';
        return event.returnValue;
      };
      window.addEventListener('beforeunload', beforeUnloadHandler);

      nextTick(() => {
        const headers = document.querySelectorAll('th[data-col]');
        headers.forEach((header) => {
          header.addEventListener('mouseup', () => {
            const key = header.getAttribute('data-col');
            if (key) {
              settings.col[key] = header.offsetWidth;
            }
          });
        });
      });
    });

    onBeforeUnmount(() => {
      stopReminderCycle();
      clearBaseTimer();
      persistBase();
      if (beforeUnloadHandler) {
        window.removeEventListener('beforeunload', beforeUnloadHandler);
      }
      notificationTimers.forEach((timer) => window.clearTimeout(timer));
      notificationTimers.clear();
    });

    return {
      settings,
      fecha,
      categorias,
      productos,
      isBaseLoaded,
      redes,
      credenciales,
      notifications,
      filtroCat,
      search,
      priceMinText,
      priceMaxText,
      modoEdicion,
      showConfig,
      showDetalle,
      showPago,
      showProvincias,
      showRequisitos,
      showRedes,
      showResetConfirm,
      selectedProd,
      productosOrdenados,
      fmt,
      catNombre,
      changeFont,
      handlePlanillaUpload,
      handleBaseUpload,
      exportJSON,
      delProd,
      edit,
      colStyle,
      visibleColumnCount,
      formatPrice,
      formatMonto,
      formatMargen,
      selectSuggestion,
      suggestionsMin,
      suggestionsMax,
      suggestionsMonto,
      suggestionsMargen,
      focused,
      hideSuggestions,
      mostrarDetalle,
      sort,
      sortKey,
      sortDir,
      pagoMontoText,
      pagoTipo,
      pagoMargenText,
      buscarOpcionesPago,
      resultadosPago,
      buscado,
      reminders,
      newReminder,
      addReminder,
      currentReminder,
      currentRemIndex,
      reminderPlaying,
      nextReminder,
      prevReminder,
      toggleReminderPlayback,
      toggleModoEdicion,
      editingRow,
      notificationIcon,
      dismissNotification,
      copyLink,
      copyCredential,
      toggleCredential,
      secretValue,
      openResetDialog,
      cancelReset,
      confirmReset
    };
  }
}).mount('#app');
