const { createApp, reactive, computed, watch, ref, onMounted, onBeforeUnmount, nextTick } = Vue;

import { DEFAULT_SETTINGS, DEFAULT_REMINDERS } from './modules/constants.js';
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

    const storedSettings = loadFromStorage('settings', DEFAULT_SETTINGS);
    const settings = reactive(mergeSettings(DEFAULT_SETTINGS, storedSettings));

    watch(settings, (value) => saveToStorage('settings', value), { deep: true });

    watch(
      () => settings.font,
      (value) => {
        document.documentElement.style.setProperty('--font-scale', value);
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

    const { fmt } = createFormatters(settings);

    const editingRow = ref(null);

    const currentRemIndex = ref(0);
    const currentReminder = computed(() => (reminders.length ? reminders[currentRemIndex.value] : ''));

    const generateId = () => crypto.randomUUID();

    const dataHandlers = createDataHandlers({
      categorias,
      productos,
      generateId,
      getSettings: () => settings
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
      const { imported, errors } = await dataHandlers.importPlanillas(files);
      if (imported) {
        const message = imported === 1 ? 'Planilla importada correctamente.' : `Planillas importadas: ${imported}`;
        window.alert(message);
      }
      if (errors.length) {
        window.alert(`Errores detectados:\n${errors.join('\n')}`);
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
      const { success, error } = await dataHandlers.importBase(file);
      if (success) {
        window.alert('Base cargada');
      } else if (error) {
        window.alert(`Error: ${error}`);
      }
    };

    const exportJSON = () => {
      dataHandlers.exportBase();
    };

    let beforeUnloadHandler = null;

    onMounted(() => {
      remindersInterval.value = window.setInterval(() => {
        if (reminders.length) {
          currentRemIndex.value = (currentRemIndex.value + 1) % reminders.length;
        }
      }, 5000);

      beforeUnloadHandler = (event) => {
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
      if (remindersInterval.value) {
        window.clearInterval(remindersInterval.value);
      }
      if (beforeUnloadHandler) {
        window.removeEventListener('beforeunload', beforeUnloadHandler);
      }
    });

    return {
      settings,
      fecha,
      categorias,
      productos,
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
      toggleModoEdicion,
      editingRow
    };
  }
}).mount('#app');
