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
  var Impact = globalThis.ChatGuardImpact;

  var masterToggle = document.getElementById("master-toggle");
  var llmToggle = document.getElementById("llm-toggle");
  var categoryList = document.getElementById("category-list");
  var usageKwh = document.getElementById("usage-kwh");
  var usageWater = document.getElementById("usage-water");
  var usageCarbon = document.getElementById("usage-carbon");
  var usageReset = document.getElementById("usage-reset");
  var savedKwh = document.getElementById("saved-kwh");
  var savedWater = document.getElementById("saved-water");
  var savedCarbon = document.getElementById("saved-carbon");
  var localUrl = document.getElementById("local-url");
  var localModel = document.getElementById("local-model");

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

  function loadUsage() {
    Storage.getLocal(
      {
        usageElectricityKwh: 0,
        usageWaterL: 0,
        usageCarbonG: 0,
        savedElectricityKwh: 0,
        savedWaterL: 0,
        savedCarbonG: 0
      },
      function (items) {
        usageKwh.textContent = Impact.format.electricity(items.usageElectricityKwh);
        usageWater.textContent = Impact.format.water(items.usageWaterL);
        usageCarbon.textContent = Impact.format.carbon(items.usageCarbonG);
        savedKwh.textContent = Impact.format.electricity(items.savedElectricityKwh);
        savedWater.textContent = Impact.format.water(items.savedWaterL);
        savedCarbon.textContent = Impact.format.carbon(items.savedCarbonG);
      }
    );
  }

  function load() {
    Storage.get(Settings.DEFAULTS, function (items) {
      masterToggle.checked = items.enabled !== false;
      llmToggle.checked = items.useLLM !== false;
      renderCategories(items.categories || Settings.DEFAULTS.categories);
    });
    Storage.getLocal(
      { localBaseUrl: "", localModel: "" },
      function (items) {
        localUrl.value = items.localBaseUrl || "";
        localModel.value = items.localModel || "";
      }
    );
    loadUsage();
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

  llmToggle.addEventListener("change", function () {
    Storage.set({ useLLM: llmToggle.checked });
  });

  localUrl.addEventListener("change", function () {
    Storage.setLocal({ localBaseUrl: localUrl.value.trim() });
  });

  localModel.addEventListener("change", function () {
    Storage.setLocal({ localModel: localModel.value.trim() });
  });

  usageReset.addEventListener("click", function () {
    Storage.setLocal({
      usageElectricityKwh: 0,
      usageWaterL: 0,
      usageCarbonG: 0,
      savedElectricityKwh: 0,
      savedWaterL: 0,
      savedCarbonG: 0
    });
    loadUsage();
  });

  load();
})();
