(function (global, factory) {
	if (typeof define === "function" && define.amd) {
		define(["exports"], factory);
	} else if (typeof exports !== "undefined") {
		factory(exports);
	} else {
		var mod = {
			exports: {}
		};
		factory(mod.exports);
		global.index = mod.exports;
	}
})(this, function (exports) {
	"use strict";

	var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

	function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

	var through = require("through2");
	var rollup = require("rollup");
	var fs = require("fs");
	var Path = require("path");
	var File = require("vinyl");

	/* ====== Utility functions ====== */
	function mapIterable(iterable, func) {
		var ret = [];
		var _iteratorNormalCompletion = true;
		var _didIteratorError = false;
		var _iteratorError = undefined;

		try {
			for (var _iterator = iterable[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
				var element = _step.value;

				ret.push(func(element));
			}
		} catch (err) {
			_didIteratorError = true;
			_iteratorError = err;
		} finally {
			try {
				if (!_iteratorNormalCompletion && _iterator["return"]) {
					_iterator["return"]();
				}
			} finally {
				if (_didIteratorError) {
					throw _iteratorError;
				}
			}
		}

		return ret;
	}

	function difference(a, b) {
		var difference = new Set(a);
		var _iteratorNormalCompletion2 = true;
		var _didIteratorError2 = false;
		var _iteratorError2 = undefined;

		try {
			for (var _iterator2 = b[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
				var element = _step2.value;

				difference["delete"](element);
			}
		} catch (err) {
			_didIteratorError2 = true;
			_iteratorError2 = err;
		} finally {
			try {
				if (!_iteratorNormalCompletion2 && _iterator2["return"]) {
					_iterator2["return"]();
				}
			} finally {
				if (_didIteratorError2) {
					throw _iteratorError2;
				}
			}
		}

		return difference;
	}

	function clone(a) {
		var ret = {};
		for (var prop in a) {
			ret[prop] = a[prop];
		}
		return ret;
	}

	/* ====== Exported helper functions ====== */

	// Reads the file at the given filepath and then returns a JSON-parsed representation of the file.
	function defaultParser(filepath) {
		var data = fs.readFileSync(filepath, "utf8");
		return JSON.parse(data);
	}

	// Returns the "targets" properties of the passed object
	function defaultIdentifier(object) {
		return Promise.resolve(object.targets);
	}

	// Returns the set of javascript targets for the chrome extension manifest object parameter
	function chromeExtensionIdentifier(manifest) {
		var targets = new Set();

		var addScript = targets.add.bind(targets);
		// Get all targets from content scripts
		if (manifest.content_scripts) {
			var _iteratorNormalCompletion3 = true;
			var _didIteratorError3 = false;
			var _iteratorError3 = undefined;

			try {
				for (var _iterator3 = manifest.content_scripts[Symbol.iterator](), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
					var contentScript = _step3.value;

					if (contentScript.js) {
						contentScript.js.map(addScript);
					}
				}
			} catch (err) {
				_didIteratorError3 = true;
				_iteratorError3 = err;
			} finally {
				try {
					if (!_iteratorNormalCompletion3 && _iterator3["return"]) {
						_iterator3["return"]();
					}
				} finally {
					if (_didIteratorError3) {
						throw _iteratorError3;
					}
				}
			}
		}

		// Get all targets from background scripts
		if (manifest.background && manifest.background.scripts) {
			manifest.background.scripts.map(addScript);
		}

		// Get all targets from browser action
		if (manifest.browser_action && manifest.browser_action.js) {
			manifest.browser_action.js.map(addScript);
		}

		// Get all targets from page action
		if (manifest.page_action && manifest.page_action.js) {
			manifest.page_action.js.map(addScript);
		}

		// Get all targets from web accessible resources
		if (manifest.web_accessible_resources) {
			var _iteratorNormalCompletion4 = true;
			var _didIteratorError4 = false;
			var _iteratorError4 = undefined;

			try {
				for (var _iterator4 = manifest.web_accessible_resources[Symbol.iterator](), _step4; !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done); _iteratorNormalCompletion4 = true) {
					var resource = _step4.value;

					if (resource.indexOf(".js") >= 0) {
						addScript(resource);
					}
				}
			} catch (err) {
				_didIteratorError4 = true;
				_iteratorError4 = err;
			} finally {
				try {
					if (!_iteratorNormalCompletion4 && _iterator4["return"]) {
						_iterator4["return"]();
					}
				} finally {
					if (_didIteratorError4) {
						throw _iteratorError4;
					}
				}
			}
		}

		return targets;
	}

	var _cacheMap = Symbol("cacheMap");

	var FileCache = (function () {
		function FileCache() {
			_classCallCheck(this, FileCache);

			this[_cacheMap] = new Map();
		}

		_createClass(FileCache, [{
			key: "add",
			value: function add(filepath, file) {
				this[_cacheMap].set(filepath, file);
			}
		}, {
			key: "has",
			value: function has(filepath) {
				return this[_cacheMap].has(filepath);
			}
		}, {
			key: "remove",
			value: function remove(filepath) {
				this[_cacheMap]["delete"](filepath);
			}
		}, {
			key: "load",
			value: function load(filepath) {
				if (this[_cacheMap].has(filepath)) {
					return this[_cacheMap].get(filepath);
				}
				var file = fs.readFileSync(filepath, { encoding: "utf-8" });
				this[_cacheMap].set(filepath, file);
				return file;
			}
		}, {
			key: "rollup",
			value: function rollup() {
				return {
					load: this.load.bind(this)
				};
			}
		}]);

		return FileCache;
	})();

	var _analyzeTargets = Symbol("analyzeTargets");
	var _bundleTarget = Symbol("bundleTarget");
	var _bundleTargets = Symbol("bundleTargets");
	var _dependencies = Symbol("dependencies");
	var _generate = Symbol("generate");
	var _resolveTargets = Symbol("resolveTargets");
	var _targetFile = Symbol("targetFile");
	var _targetIdentifier = Symbol("targetIdentifier");
	var _targetParser = Symbol("targetParser");
	var _targets = Symbol("targets");
	/*
 options.targetFile
 	Specifies the path to the file containing the target definitions. If relative, uses cwd.
 
 options.srcDir
 	Specifies the path from the definition file to the source root. Defaults to the same directory as targetFile
 
 */

	var Project = (function () {
		function Project(options) {
			_classCallCheck(this, Project);

			this.srcDir = options.srcDir || ".";
			this.rollup = options.rollup || {};
			this.rollup.plugins = this.rollup.plugins || [];
			this.generate = options.generate || {};
			Object.defineProperty(this, "cache", { value: new FileCache() });

			if (options.targets) {
				var targets = [];
				var _iteratorNormalCompletion5 = true;
				var _didIteratorError5 = false;
				var _iteratorError5 = undefined;

				try {
					for (var _iterator5 = options.targets[Symbol.iterator](), _step5; !(_iteratorNormalCompletion5 = (_step5 = _iterator5.next()).done); _iteratorNormalCompletion5 = true) {
						var target = _step5.value;

						targets.push(Path.resolve(options.srcDir, target));
					}
				} catch (err) {
					_didIteratorError5 = true;
					_iteratorError5 = err;
				} finally {
					try {
						if (!_iteratorNormalCompletion5 && _iterator5["return"]) {
							_iterator5["return"]();
						}
					} finally {
						if (_didIteratorError5) {
							throw _iteratorError5;
						}
					}
				}

				this[_targets] = targets;
			} else if (options.targetFile) {
				this[_targetFile] = Path.resolve(options.targetFile);
				this[_targetParser] = options.targetParser || defaultParser;
				this[_targetIdentifier] = options.targetIdentifier || defaultIdentifier;
			}

			this[_dependencies] = new Map();
			if (this[_targetFile]) {
				var object = this[_targetParser](this[_targetFile]);
				this[_targets] = this[_resolveTargets](object);
			}
			this.rollup.plugins.push(this.cache.rollup);
		}

		_createClass(Project, [{
			key: _resolveTargets,
			value: function value(object) {
				var targets = [];
				var _iteratorNormalCompletion6 = true;
				var _didIteratorError6 = false;
				var _iteratorError6 = undefined;

				try {
					for (var _iterator6 = this[_targetIdentifier](object)[Symbol.iterator](), _step6; !(_iteratorNormalCompletion6 = (_step6 = _iterator6.next()).done); _iteratorNormalCompletion6 = true) {
						var target = _step6.value;

						targets.push(Path.resolve(Path.dirname(this[_targetFile]), this.srcDir, target));
					}
				} catch (err) {
					_didIteratorError6 = true;
					_iteratorError6 = err;
				} finally {
					try {
						if (!_iteratorNormalCompletion6 && _iterator6["return"]) {
							_iterator6["return"]();
						}
					} finally {
						if (_didIteratorError6) {
							throw _iteratorError6;
						}
					}
				}

				return targets;
			}

			/*
   Reads targets from the target source file if it exists, and returns the added/removed targets
   */
		}, {
			key: _analyzeTargets,
			value: function value() {
				if (this[_targetFile]) {
					var object = this[_targetParser](this[_targetFile]);
					var targets = this[_resolveTargets](object);
					var add = difference(targets, this[_targets]);
					var remove = difference(this[_targets], targets);
					this[_targets] = targets;
					return { add: add, remove: remove };
				} else {
					return { add: {}, remove: {} };
				}
			}

			/*
   Creates a rollup bundle for the target file parameter, returns a promise with the bundle
   */
		}, {
			key: _bundleTarget,
			value: function value(target) {
				var options = clone(this.rollup);
				options.entry = target;

				console.log("==> Bundling: " + target);
				return rollup.rollup(options).then((function (bundle) {
					this[_dependencies].set(target, bundle.modules);
					return { bundle: bundle, target: target };
				}).bind(this));
			}

			/*
   Creates rollup bundles for the targets passed to the function or all targets for this Project, returns a promise with all bundles.
   */
		}, {
			key: _bundleTargets,
			value: function value(targets) {
				var targetSet = targets || this[_targets];
				return Promise.all(mapIterable(targetSet, this[_bundleTarget].bind(this)));
			}

			/*
   Takes an iterable of bundles and returns an array of generated source+map target objects.
   */
		}, {
			key: _generate,
			value: function value(targetBundles) {
				var gen = [];
				var _iteratorNormalCompletion7 = true;
				var _didIteratorError7 = false;
				var _iteratorError7 = undefined;

				try {
					for (var _iterator7 = targetBundles[Symbol.iterator](), _step7; !(_iteratorNormalCompletion7 = (_step7 = _iterator7.next()).done); _iteratorNormalCompletion7 = true) {
						var targetBundle = _step7.value;

						console.log("==> Generating: " + targetBundle.target);
						var generated = targetBundle.bundle.generate(this.generate);
						gen.push({
							code: generated.code,
							map: generated.map,
							target: targetBundle.target
						});
					}
				} catch (err) {
					_didIteratorError7 = true;
					_iteratorError7 = err;
				} finally {
					try {
						if (!_iteratorNormalCompletion7 && _iterator7["return"]) {
							_iterator7["return"]();
						}
					} finally {
						if (_didIteratorError7) {
							throw _iteratorError7;
						}
					}
				}

				return gen;
			}

			/**
    * Determines if the given filepath refers to the target source
    * @param {string} filepath
    * @return {boolean} isTargetSource
    */
		}, {
			key: "isTargetSource",
			value: function isTargetSource(filepath) {
				return filepath === this[_targetFile];
			}

			/**
    * Determines if the given filepath refers to a target
    * @param {string} filepath
    * @return {boolean} isTarget
    */
		}, {
			key: "isTarget",
			value: function isTarget(filepath) {
				return this[_targets].indexOf(filepath) >= 0;
			}

			/**
    * Determines if the given filepath is a dependency of the provided target, or a dependency of any target if no target passed.
    * @param {string} filepath
    * @param {string} target
    * @return {boolean} isDependency
    */
		}, {
			key: "isDependency",
			value: function isDependency(filepath, target) {
				// If specific target, return true if that target has this file as a dependency
				if (target) {
					var targetDependencies = this[_dependencies].get(target);
					if (filepath != target && targetDependencies) {
						var _iteratorNormalCompletion8 = true;
						var _didIteratorError8 = false;
						var _iteratorError8 = undefined;

						try {
							for (var _iterator8 = targetDependencies[Symbol.iterator](), _step8; !(_iteratorNormalCompletion8 = (_step8 = _iterator8.next()).done); _iteratorNormalCompletion8 = true) {
								var dependency = _step8.value;

								if (dependency.id === filepath) return true;
							}
						} catch (err) {
							_didIteratorError8 = true;
							_iteratorError8 = err;
						} finally {
							try {
								if (!_iteratorNormalCompletion8 && _iterator8["return"]) {
									_iterator8["return"]();
								}
							} finally {
								if (_didIteratorError8) {
									throw _iteratorError8;
								}
							}
						}
					}
				} else {
					var _iteratorNormalCompletion9 = true;
					var _didIteratorError9 = false;
					var _iteratorError9 = undefined;

					try {
						for (var _iterator9 = this[_targets][Symbol.iterator](), _step9; !(_iteratorNormalCompletion9 = (_step9 = _iterator9.next()).done); _iteratorNormalCompletion9 = true) {
							var _target = _step9.value;

							var targetDependencies = this[_dependencies].get(_target);
							if (filepath != _target && targetDependencies) {
								var _iteratorNormalCompletion10 = true;
								var _didIteratorError10 = false;
								var _iteratorError10 = undefined;

								try {
									for (var _iterator10 = targetDependencies[Symbol.iterator](), _step10; !(_iteratorNormalCompletion10 = (_step10 = _iterator10.next()).done); _iteratorNormalCompletion10 = true) {
										var dependency = _step10.value;

										if (dependency.id === filepath) return true;
									}
								} catch (err) {
									_didIteratorError10 = true;
									_iteratorError10 = err;
								} finally {
									try {
										if (!_iteratorNormalCompletion10 && _iterator10["return"]) {
											_iterator10["return"]();
										}
									} finally {
										if (_didIteratorError10) {
											throw _iteratorError10;
										}
									}
								}
							}
						}
					} catch (err) {
						_didIteratorError9 = true;
						_iteratorError9 = err;
					} finally {
						try {
							if (!_iteratorNormalCompletion9 && _iterator9["return"]) {
								_iterator9["return"]();
							}
						} finally {
							if (_didIteratorError9) {
								throw _iteratorError9;
							}
						}
					}
				}
				return false;
			}

			/**
    * Returns all targets that have the given file as a dependency.
    * @param {string} filepath
    * @return {Array} targetsForFile
    */
		}, {
			key: "getTargetsForFile",
			value: function getTargetsForFile(filepath) {
				var ret = [];
				var _iteratorNormalCompletion11 = true;
				var _didIteratorError11 = false;
				var _iteratorError11 = undefined;

				try {
					for (var _iterator11 = this[_targets][Symbol.iterator](), _step11; !(_iteratorNormalCompletion11 = (_step11 = _iterator11.next()).done); _iteratorNormalCompletion11 = true) {
						var target = _step11.value;

						var targetDependencies = this[_dependencies].get(target);
						if (targetDependencies) {
							var _iteratorNormalCompletion12 = true;
							var _didIteratorError12 = false;
							var _iteratorError12 = undefined;

							try {
								for (var _iterator12 = targetDependencies[Symbol.iterator](), _step12; !(_iteratorNormalCompletion12 = (_step12 = _iterator12.next()).done); _iteratorNormalCompletion12 = true) {
									var dependency = _step12.value;

									if (dependency.id === filepath) ret.push(target);
								}
							} catch (err) {
								_didIteratorError12 = true;
								_iteratorError12 = err;
							} finally {
								try {
									if (!_iteratorNormalCompletion12 && _iterator12["return"]) {
										_iterator12["return"]();
									}
								} finally {
									if (_didIteratorError12) {
										throw _iteratorError12;
									}
								}
							}
						}
					}
				} catch (err) {
					_didIteratorError11 = true;
					_iteratorError11 = err;
				} finally {
					try {
						if (!_iteratorNormalCompletion11 && _iterator11["return"]) {
							_iterator11["return"]();
						}
					} finally {
						if (_didIteratorError11) {
							throw _iteratorError11;
						}
					}
				}

				return ret;
			}
		}, {
			key: "getSourceRoot",
			value: function getSourceRoot() {
				return Path.resolve(Path.dirname(this[_targetFile]), this.srcDir);
			}

			/*
    * Builds all targets of this project and returns a promise containing an array of generated objects
    *
    * Generated objects are of the form:
    * {
    * 	{string} code - the generated code,
    * 	{string} map - the sourcemap,
    *	{string} target - the original filepath
    * }
    * @return {Promise<Array>} the array of generated objects
    */
		}, {
			key: "build",
			value: function build() {
				console.log("Building project");
				return this[_bundleTargets]().then(this[_generate]);
			}

			/*
    * Handles a change to the given filepath and returns a promise containing an array of generated objects.
    *
    * On manifest change, re-analyzes all targets and rebuilds new targets.
    * On target change, rebuilds target.
    * On dependency change, rebuilds all targets dependent on the file.
    *
    * Generated objects are of the form
    * {
    * 	{string} code - the generated code,
    * 	{string} map - the sourcemap,
    *	{string} target - the original filepath
    * }
    * @return {Promise<Array>} the array of generated objects
    */
		}, {
			key: "change",
			value: function change(filepath) {
				console.log("Handling change to: " + filepath);
				// If source, re-analyze targets and rebuild changed/added targets
				if (this.isTargetSource(filepath)) {
					var targetDelta = this[_analyzeTargets]();
					return this[_bundleTargets](targetDelta.add).then(this[_generate].bind(this));
				} else {
					var buildTargets = [];
					buildTargets = this.getTargetsForFile(filepath);

					return this[_bundleTargets](buildTargets).then(this[_generate].bind(this));
				}
			}
		}]);

		return Project;
	})();

	var projects = new Map();

	var ProjectStream = {
		/*
  */
		build: function build(options) {
			if (!projects.has(Path.resolve(options.targetFile))) {
				projects.set(Path.resolve(options.targetFile), new Project(options));
			}
			var project = projects.get(Path.resolve(options.targetFile));

			return through.obj(function (file, enc, callback) {
				project.cache.add(file.path, file.contents.toString("utf-8"));
				callback();
			}, function (callback) {
				project.build().then((function (generatedFiles) {
					var _iteratorNormalCompletion13 = true;
					var _didIteratorError13 = false;
					var _iteratorError13 = undefined;

					try {
						for (var _iterator13 = generatedFiles[Symbol.iterator](), _step13; !(_iteratorNormalCompletion13 = (_step13 = _iterator13.next()).done); _iteratorNormalCompletion13 = true) {
							var generated = _step13.value;

							this.push(new File({
								cwd: process.cwd,
								base: project.getSourceRoot(),
								path: generated.target,
								contents: new Buffer(generated.code)
							}));

							if (options.map) {
								this.push(new File({
									cwd: process.cwd,
									base: project.getSourceRoot(),
									path: generated.target + ".map",
									contents: new Buffer(generated.map)
								}));
							}
						}
					} catch (err) {
						_didIteratorError13 = true;
						_iteratorError13 = err;
					} finally {
						try {
							if (!_iteratorNormalCompletion13 && _iterator13["return"]) {
								_iterator13["return"]();
							}
						} finally {
							if (_didIteratorError13) {
								throw _iteratorError13;
							}
						}
					}

					console.log("Project build completed");
					callback();
				}).bind(this))["catch"](function (err) {
					callback(err);
				});
			});
		},

		change: function change(options) {
			if (!projects.has(Path.resolve(options.targetFile))) {
				projects.set(Path.resolve(options.targetFile), new Project(options));
			}
			var project = projects.get(Path.resolve(options.targetFile));

			return through.obj(function (file, enc, callback) {
				if (file.event) {
					if (file.event === "unlink") project.cache.remove(file.path);else project.cache.add(file.path, file.contents.toString("utf-8"));
				}
				project.change(file.path).then((function (generatedFiles) {
					var _iteratorNormalCompletion14 = true;
					var _didIteratorError14 = false;
					var _iteratorError14 = undefined;

					try {
						for (var _iterator14 = generatedFiles[Symbol.iterator](), _step14; !(_iteratorNormalCompletion14 = (_step14 = _iterator14.next()).done); _iteratorNormalCompletion14 = true) {
							var generated = _step14.value;

							this.push(new File({
								cwd: process.cwd,
								base: project.getSourceRoot(),
								path: generated.target,
								contents: new Buffer(generated.code)
							}));

							if (options.map) {
								this.push(new File({
									cwd: process.cwd,
									base: project.getSourceRoot(),
									path: generated.target + ".map",
									contents: new Buffer(generated.map)
								}));
							}
						}
					} catch (err) {
						_didIteratorError14 = true;
						_iteratorError14 = err;
					} finally {
						try {
							if (!_iteratorNormalCompletion14 && _iterator14["return"]) {
								_iterator14["return"]();
							}
						} finally {
							if (_didIteratorError14) {
								throw _iteratorError14;
							}
						}
					}

					console.log("Delta build completed");
					callback();
				}).bind(this))["catch"](function (err) {
					callback(err);
				});
			});
		}
	};

	module.exports = { Project: Project, build: ProjectStream.build, change: ProjectStream.change, defaultParser: defaultParser, defaultIdentifier: defaultIdentifier, chromeExtensionIdentifier: chromeExtensionIdentifier };
});