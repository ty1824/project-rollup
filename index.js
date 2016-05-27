"use strict";

let through = require("through2");
let rollup = require("rollup");
let fs = require("fs");
let Path = require("path");
let File = require("vinyl");

/* ====== Utility functions ====== */
function mapIterable(iterable, func) {
	let ret = [];
	for (let element of iterable) {
		ret.push(func(element));
	}
	return ret;
}

function difference(a, b) {
  let difference = new Set(a);
  for (let element of b) {
    difference.delete(element);
  }

  return difference;
}

function clone(a) {
	let ret = {};
	for (let prop in a) {
		ret[prop] = a[prop];
	}
	return ret;
}


/* ====== Exported helper functions ====== */

// Reads the file at the given filepath and then returns a JSON-parsed representation of the file.
function defaultParser(filepath) {
	let data = fs.readFileSync(filepath, "utf8");
    return JSON.parse(data);
}

// Returns the "targets" properties of the passed object
function defaultIdentifier(object) {
	return Promise.resolve(object.targets);
}

// Returns the set of javascript targets for the chrome extension manifest object parameter
function chromeExtensionIdentifier(manifest) {
	let targets = new Set();

	let addScript = targets.add.bind(targets);
	// Get all targets from content scripts
	if (manifest.content_scripts) {
		for (let contentScript of manifest.content_scripts) {
			if (contentScript.js) {
				contentScript.js.map(addScript);
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
		for (let resource of manifest.web_accessible_resources) {
			if (resource.indexOf(".js") >= 0) { addScript(resource); }
		}
	}

	return targets;
}

let _cacheMap = Symbol("cacheMap");
class FileCache {
	constructor() {
		this[_cacheMap] = new Map();
	}

	add(filepath, file) {
		this[_cacheMap].set(filepath, file);
	}

	has(filepath) {
		return this[_cacheMap].has(filepath);
	}

	remove(filepath) {
		this[_cacheMap].delete(filepath);
	}

	load(filepath) {
		if (this[_cacheMap].has(filepath)) {
			return this[_cacheMap].get(filepath);
		}
		let file = fs.readFileSync(filepath, { encoding : "utf-8" });
		this[_cacheMap].set(filepath, file);
		return file;
	}

	rollup() {
		return {
			load : this.load.bind(this)
		};
	}
}

let _analyzeTargets = Symbol("analyzeTargets");
let _bundleTarget = Symbol("bundleTarget");
let _bundleTargets = Symbol("bundleTargets");
let _dependencies = Symbol("dependencies");
let _generate = Symbol("generate");
let _resolveTargets = Symbol("resolveTargets");
let _targetFile = Symbol("targetFile");
let _targetIdentifier = Symbol("targetIdentifier");
let _targetParser = Symbol("targetParser");
let _targets = Symbol("targets");
/*
options.targetFile
	Specifies the path to the file containing the target definitions. If relative, uses cwd.

options.srcDir
	Specifies the path from the definition file to the source root. Defaults to the same directory as targetFile

*/
class Project {
	constructor(options) {
		this.srcDir = options.srcDir || ".";
		this.options = options.options;
		options.plugins = options.plugins || [ this.cache.rollup ];
		Object.defineProperty(this,
			"cache", { value : new FileCache() });

		if (options.targets) {
			let targets = [];
			for (let target of options.targets) {
				targets.push(Path.resolve(options.srcDir, target));
			}
			this[_targets] = targets;
		} else if (options.targetFile) {
			this[_targetFile] = Path.resolve(options.targetFile);
			this[_targetParser] = options.targetParser || defaultParser;
			this[_targetIdentifier] = options.targetIdentifier || defaultIdentifier;
		}

		this[_dependencies] = new Map();
		if (this[_targetFile]) {
			let object = this[_targetParser](this[_targetFile]);
			this[_targets] = this[_resolveTargets](object);
		}
	}

	[_resolveTargets](object) {
		let targets = [];
		for (let target of this[_targetIdentifier](object)) {
			targets.push(Path.resolve(Path.dirname(this[_targetFile]), this.srcDir, target));
		}
		return targets;
	}

	/*
	Reads targets from the target source file if it exists, and returns the added/removed targets
	*/
	[_analyzeTargets]() {
		if (this[_targetFile]) {
			let object = this[_targetParser](this[_targetFile])
			let targets = this[_resolveTargets](object);
			let add = difference(targets, this[_targets]);
			let remove = difference(this[_targets], targets);
			this[_targets] = targets;
			return {add, remove};
		} else {
			return {add : {}, remove : {}};
		}
	}

	/*
	Creates a rollup bundle for the target file parameter, returns a promise with the bundle
	*/
	[_bundleTarget](target) {
		let options = clone(this.generateOptions);
		options.entry = target;

		console.log("==> Bundling: " + target);
		return rollup.rollup(options)
		.then(function(bundle) {
			this[_dependencies].set(target, bundle.modules);
			return { bundle, target };
		}.bind(this))
	}

	/*
	Creates rollup bundles for the targets passed to the function or all targets for this Project, returns a promise with all bundles.
	*/
	[_bundleTargets](targets) {
		let targetSet = targets || this[_targets];
		return Promise.all(mapIterable(targetSet, this[_bundleTarget].bind(this)));
	}

	/*
	Takes an iterable of bundles and returns an array of generated source+map target objects.
	*/
	[_generate](targetBundles) {
		let gen = [];
		for (let targetBundle of targetBundles) {
			console.log("==> Generating: " + targetBundle.target);
			let generated = targetBundle.bundle.generate();
			gen.push({
				code : generated.code,
				map : generated.map,
				target : targetBundle.target
			});
		}
		return gen;
	}

	/**
	 * Determines if the given filepath refers to the target source
	 * @param {string} filepath
	 * @return {boolean} isTargetSource
	 */
	isTargetSource(filepath) {
		return filepath === this[_targetFile];
	}

	/**
	 * Determines if the given filepath refers to a target
	 * @param {string} filepath
	 * @return {boolean} isTarget
	 */
	isTarget(filepath) {
		return this[_targets].indexOf(filepath) >= 0;
	}

	/**
	 * Determines if the given filepath is a dependency of the provided target, or a dependency of any target if no target passed.
	 * @param {string} filepath
	 * @param {string} target
	 * @return {boolean} isDependency
	 */
	isDependency(filepath, target) {
		// If specific target, return true if that target has this file as a dependency
		if (target) {
			let targetDependencies = this[_dependencies].get(target);
			if (filepath != target && targetDependencies) {
				for (let dependency of targetDependencies) {
					if (dependency.id === filepath) return true;
				}
			}
		} else {
			for (let target of this[_targets]) {
				let targetDependencies = this[_dependencies].get(target);
				if (filepath != target && targetDependencies) {
					for (let dependency of targetDependencies) {
						if (dependency.id === filepath) return true;
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
	getTargetsForFile(filepath) {
		let ret = [];
		for (let target of this[_targets]) {
			let targetDependencies = this[_dependencies].get(target);
			if (targetDependencies) {
				for (let dependency of targetDependencies) {
					if (dependency.id === filepath) ret.push(target);
				}
			}
		}

		return ret;
	}

	getSourceRoot() {
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
	build() {
		console.log("Building project");
		return this[_bundleTargets]()
			.then(this[_generate]);
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
	change(filepath) {
		console.log("Handling change to: " + filepath);
		// If source, re-analyze targets and rebuild changed/added targets
		if (this.isTargetSource(filepath)) {
			let targetDelta = this[_analyzeTargets]();
			return this[_bundleTargets](targetDelta.add)
				.then(this[_generate].bind(this));
		} else {
			let buildTargets = [];
			buildTargets = this.getTargetsForFile(filepath);

			return this[_bundleTargets](buildTargets)
				.then(this[_generate].bind(this));
		}
	}
}

let projects = new Map();

let ProjectStream = {
	/*
	*/
	build : function(options) {
		if (!projects.has(Path.resolve(options.targetFile))) {
			projects.set(Path.resolve(options.targetFile), new Project(options));
		}
		let project = projects.get(Path.resolve(options.targetFile));

		return through.obj(function(file, enc, callback) {
			project.cache.add(file.path, file.contents.toString("utf-8"));
			callback();
		}, function(callback) {
			project.build()
			.then(function(generatedFiles) {
				for (let generated of generatedFiles) {
					this.push(new File({
						cwd : process.cwd,
						base : project.getSourceRoot(),
						path : generated.target,
						contents : new Buffer(generated.code)
					}));

					if (options.map) {
						this.push(new File({
							cwd : process.cwd,
							base : project.getSourceRoot(),
							path : generated.target + ".map",
							contents : new Buffer(generated.map)
						}));
					}
				}
				console.log("Project build completed");
				callback();
			}.bind(this))
			.catch(function(err) {
				callback(err);
			})
		});
	},

	change : function(options) {
		if (!projects.has(Path.resolve(options.targetFile))) {
			projects.set(Path.resolve(options.targetFile), new Project(options));
		}
		let project = projects.get(Path.resolve(options.targetFile));

		return through.obj(function(file, enc, callback) {
			if (file.event) {
				if (file.event === "unlink") project.cache.remove(file.path);
				else project.cache.add(file.path, file.contents.toString("utf-8"));
			}
			project.change(file.path)
			.then(function(generatedFiles) {
				for (let generated of generatedFiles) {
					this.push(new File({
						cwd : process.cwd,
						base : project.getSourceRoot(),
						path : generated.target,
						contents : new Buffer(generated.code)
					}))

					if (options.map) {
						this.push(new File({
							cwd : process.cwd,
							base : project.getSourceRoot(),
							path : generated.target + ".map",
							contents : new Buffer(generated.map)
						}));
					}
				}
				console.log("Delta build completed");
				callback();
			}.bind(this))
			.catch(function(err) {
				callback(err);
			})
		});
	}
}

module.exports = {Project, build : ProjectStream.build, change : ProjectStream.change, defaultParser, defaultIdentifier, chromeExtensionIdentifier};
