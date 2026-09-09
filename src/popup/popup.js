/**
 * ChatGuard — popup controller.
 * Reads/writes chrome.storage.sync and renders the per-category toggles from
 * the shared detector category list.
 */
(function () {
  "use strict";

  var Settings = globalThis.ChatGuardSettings;
  var Detector = globalThis.ChatGuardDetector;
  var Storage = globalThis.ChatGuardStorage;

  var masterToggle = document.getElementById("master-toggle");
  var categoryList = document.getElementById("category-list");

  function renderCategories(categories) {
    categoryList.innerHTML = "";
    Detector.CATEGORIES.forEach(function (category) {
      var row = document.createElement("label");
      row.className = "row";

      var label = document.createElement("span");
      label.textContent = category.label;

      var input = document.createElement("input");
      input.type = "checkbox";
      input.checked = categories[category.id] !== false;
      input.addEventListener("change", saveCategories);

      row.appendChild(label);
      row.appendChild(input);
      categoryList.appendChild(row);
    });
  }

  function load() {
    Storage.get(Settings.DEFAULTS, function (items) {
      masterToggle.checked = items.enabled !== false;
      renderCategories(items.categories || Settings.DEFAULTS.categories);
    });
  }

  function saveCategories() {
    Storage.get(Settings.DEFAULTS, function (items) {
      var categories = Object.assign(
        {},
        Settings.DEFAULTS.categories,
        items.categories || {}
      );
      var inputs = categoryList.querySelectorAll("input[type='checkbox']");
      Detector.CATEGORIES.forEach(function (category, index) {
        categories[category.id] = inputs[index].checked;
      });
      Storage.set({ categories: categories });
    });
  }

  masterToggle.addEventListener("change", function () {
    Storage.set({ enabled: masterToggle.checked });
  });

  load();
})();
