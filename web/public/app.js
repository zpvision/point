'use strict';
document.getElementById('application').addEventListener('submit', function(event) {
  event.preventDefault();
  const fields = new FormData(event.currentTarget);
  const content = ['Point — черновик заявки партнёрского поинта', 'Заявка не отправлена. Получатель не подключён.', '', 'Поинт: ' + fields.get('point'), 'Адрес: ' + fields.get('address'), 'Имя: ' + fields.get('name'), 'Контакт: ' + fields.get('contact'), 'Описание: ' + fields.get('details'), '', 'Условия участия и пилота требуют согласования.'].join('\n');
  const url = URL.createObjectURL(new Blob(['\ufeff' + content], {type:'text/plain;charset=utf-8'}));
  const link = document.createElement('a');
  link.href = url; link.download = 'Point_заявка_черновик.txt';
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  document.getElementById('form-status').textContent = 'Черновик подготовлен для скачивания. Заявка не отправлена; отправка будет доступна после подключения получателя.';
});

const incomeFields = ['parcels', 'days', 'rate'].map(id => document.getElementById(id));
function calculateIncome() {
  const valid = incomeFields.every(field => field.value.trim() !== '' && field.checkValidity());
  const revenue = document.getElementById('revenue');
  const formula = document.getElementById('calc-formula');
  const count = document.getElementById('monthly-parcels');
  const error = document.getElementById('calc-error');
  if (!valid) {
    revenue.textContent = '—'; formula.textContent = 'Уточните значения для расчёта'; count.textContent = '—';
    error.textContent = 'Укажите целое число посылок от 0 до 10 000, от 1 до 31 рабочего дня и тариф от 0 до 100 000 ₽.';
    return;
  }
  const [parcels, days, rate] = incomeFields.map(field => Number(field.value));
  const format = value => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value);
  revenue.textContent = format(parcels * days * rate) + ' ₽';
  formula.textContent = `${format(parcels)} × ${days} × ${format(rate)} ₽`;
  count.textContent = format(parcels * days) + ' посылок в месяц';
  error.textContent = '';
}
incomeFields.forEach(field => field.addEventListener('input', calculateIncome));
calculateIncome();
