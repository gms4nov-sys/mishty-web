// Shared helper for Admin Panel list pages:
//   1. Live search/filter — hides table rows that don't match the typed text
//   2. Bulk select-all + bulk action bar (delete / status change) via a
//      single "checked ids" hidden form submitted to a bulk-action endpoint
//   3. Native drag-and-drop row reordering, posting the new order to the
//      server as soon as a row is dropped in a new position
//
// Usage per page (see any *.ejs list view for a working example):
//   <input id="adminSearch" data-admin-search="adminTable">
//   <table id="adminTable">...</table>
//   <script src="/admin/public/admin-list.js"></script>
//   <script>AdminList.init({ searchInputId: 'adminSearch', tableId: 'adminTable', reorderUrlBase: '/admin/gallery' });</script>

(function () {
  function initSearch(inputId, tableId) {
    var input = document.getElementById(inputId);
    var table = document.getElementById(tableId);
    if (!input || !table) return;
    input.addEventListener('input', function () {
      var q = input.value.trim().toLowerCase();
      var rows = table.querySelectorAll('tbody tr');
      var visibleCount = 0;
      rows.forEach(function (row) {
        var match = !q || row.textContent.toLowerCase().indexOf(q) !== -1;
        row.style.display = match ? '' : 'none';
        if (match) visibleCount++;
      });
      var emptyRow = table.querySelector('.no-results-row');
      if (!visibleCount) {
        if (!emptyRow) {
          emptyRow = document.createElement('tr');
          emptyRow.className = 'no-results-row';
          var td = document.createElement('td');
          td.colSpan = (table.querySelectorAll('thead th').length) || 6;
          td.style.textAlign = 'center';
          td.style.color = 'var(--gray)';
          td.style.padding = '18px';
          td.textContent = 'No results match your search.';
          emptyRow.appendChild(td);
          table.querySelector('tbody').appendChild(emptyRow);
        }
      } else if (emptyRow) {
        emptyRow.remove();
      }
    });
  }

  function initBulkActions(opts) {
    var table = document.getElementById(opts.tableId);
    if (!table) return;
    var selectAll = document.getElementById(opts.selectAllId);
    var bar = document.getElementById(opts.bulkBarId);
    var countEl = bar ? bar.querySelector('[data-bulk-count]') : null;

    function checkedBoxes() {
      return Array.prototype.slice.call(table.querySelectorAll('tbody input[type="checkbox"][data-row-id]:checked'));
    }
    function refreshBar() {
      var n = checkedBoxes().length;
      if (bar) bar.style.display = n ? 'flex' : 'none';
      if (countEl) countEl.textContent = n;
    }
    table.querySelectorAll('tbody input[type="checkbox"][data-row-id]').forEach(function (cb) {
      cb.addEventListener('change', refreshBar);
    });
    if (selectAll) {
      selectAll.addEventListener('change', function () {
        table.querySelectorAll('tbody input[type="checkbox"][data-row-id]').forEach(function (cb) { cb.checked = selectAll.checked; });
        refreshBar();
      });
    }
    if (bar) {
      bar.querySelectorAll('[data-bulk-action]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var ids = checkedBoxes().map(function (cb) { return cb.getAttribute('data-row-id'); });
          if (!ids.length) return;
          var action = btn.getAttribute('data-bulk-action');
          if (action === 'delete' && !confirm('Delete ' + ids.length + ' selected item(s)? This cannot be undone.')) return;
          var form = document.createElement('form');
          form.method = 'POST';
          form.action = opts.bulkUrl;
          form.innerHTML = '<input type="hidden" name="_csrf" value="' + opts.csrfToken + '">' +
            '<input type="hidden" name="action" value="' + action + '">' +
            ids.map(function (id) { return '<input type="hidden" name="ids" value="' + id + '">'; }).join('');
          document.body.appendChild(form);
          form.submit();
        });
      });
    }
  }

  function initDragReorder(opts) {
    var table = document.getElementById(opts.tableId);
    if (!table) return;
    var tbody = table.querySelector('tbody');
    var dragEl = null;
    tbody.querySelectorAll('tr[data-row-id]').forEach(function (row) {
      var handle = row.querySelector('.drag-handle') || row;
      row.draggable = true;
      row.addEventListener('dragstart', function (e) {
        dragEl = row;
        row.style.opacity = '0.4';
        e.dataTransfer.effectAllowed = 'move';
      });
      row.addEventListener('dragend', function () {
        row.style.opacity = '';
        dragEl = null;
      });
      row.addEventListener('dragover', function (e) {
        e.preventDefault();
        if (!dragEl || dragEl === row) return;
        var rect = row.getBoundingClientRect();
        var after = (e.clientY - rect.top) > rect.height / 2;
        row.parentNode.insertBefore(dragEl, after ? row.nextSibling : row);
      });
      row.addEventListener('drop', function (e) {
        e.preventDefault();
        var ids = Array.prototype.map.call(tbody.querySelectorAll('tr[data-row-id]'), function (r) { return r.getAttribute('data-row-id'); });
        fetch(opts.reorderUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ _csrf: opts.csrfToken, ids: ids })
        }).catch(function (err) { console.warn('Reorder save failed:', err); });
      });
    });
  }

  window.AdminList = {
    init: function (opts) {
      if (opts.searchInputId) initSearch(opts.searchInputId, opts.tableId);
      if (opts.bulkBarId) initBulkActions(opts);
      if (opts.reorderUrl) initDragReorder(opts);
    }
  };
})();
