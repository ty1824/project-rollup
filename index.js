"use strict"

let through = require("through2");
let rollup = require("rollup");
let fs = require("fs");
let Path = require("path");
let File = require("vinyl");

/* ====== Utility functions ====== */
function arrayFrom(iterable) {
	let ret = [];
	for (let element of iterable) {
		ret.push(element);
	}
	return ret;
}

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


/* ====== Exported helper functions ====== */

// Reads the file at the given filepath and then returns a JSON-parsed representation of the file.
function defaultParser(filepath) {
	return new Promise(function(resolve, reject) {
		fs.readFile(filepath, 'utf8', function(err, data) {
			if (err) {
	        	return reject(err);
	        }

	        resolve(JSON.parse(data))
		});
	});
	
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
			if (resource.indexOf(".js")) { addScript(resource); }
		}
	}

	return targets;
}


let _analyzeTargets = Symbol("analyzeTargets");
let _bundleTarget = Symbol("bundleTarget");
let _bundleTargets = Symbol("bundleTargets");
let _checkInit = Symbol("isInit");
let _dependencies = Symbol("dependencies");
let _init = Symbol("init");
let _generate = Symbol("init");
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
		this.options = options.rollup;

		if (options.targets) {
			let targets = [];
			for (target of options.targets) {
				targets.push(Path.resolve(options.srcDir, target));
			}
			this[_targets] = targets;
		} else if (options.targetFile) {
			this[_targetFile] = Path.resolve(options.targetFile);
			this[_targetParser] = options.targetParser || defaultParser;
			this[_targetIdentifier] = options.targetIdentifier || defaultIdentifier;
		}

		this[_init]();
	}

	[_resolveTargets](object) {
		let targets = [];
		for (let target of this[_targetIdentifier](object)) {
			targets.push(Path.resolve(Path.dirname(this[_targetFile]), this.srcDir, target));
		}
		return targets;
	}

	[_init]() {
		this[_dependencies] = new Map();
		let ret = Promise.resolve(this[_targets]);
		if (this[_targetFile]) {
			ret = this[_targetParser](this[_targetFile])
			.then(function(object) {
				return this[_targets] = this[_resolveTargets](object);
			}.bind(this))
			.catch(function(err) {
				return err;
			})
		}
		this[_checkInit] = ret;
		return ret;
	}

	/*
	Reads targets from the target source file if it exists, and returns a promise with the added/removed targets
	*/
	[_analyzeTargets]() {
		return this[_checkInit]
		.then(function() {
			if (this[_targetFile]) {
				return this[_targetParser](this[_targetFile])
				.then(function(object) {
					let targets = this[_resolveTargets](object);
					let add = difference(targets, this[_targets]);
					let remove = difference(this[_targets], targets);
					this[_targets] = targets;
					return {add, remove};
				})
			} else {
				return Promise.resolve({add : {}, remove : {}});
			}
		}.bind(this));
	}

	/*
	Creates a rollup bundle for the target file parameter
	*/
	[_bundleTarget](target) {
		return this[_checkInit]
		.then(function() {
			return rollup.rollup({
		      entry : target,
		    }).then(function(bundle) {
		    	this[_dependencies].set(target, bundle.modules);
		    	return { bundle, target };
		    }.bind(this))
		}.bind(this));
	}

	[_bundleTargets](targets) {
		return this[_checkInit]
		.then(function() {
			let targetSet = targets || this[_targets];
			return Promise.all(mapIterable(targetSet, this[_bundleTarget].bind(this)));
		}.bind(this));
		
	}

	[_generate](targetBundles) {
		let gen = [];
		for (let targetBundle of targetBundles) {
			let generated = targetBundle.bundle.generate();
			gen.push({
				code : generated.code,
				map : generated.map,
				target : targetBundle.target
			});
		}
		return gen;
	}

	isTargetSource(file) {
    	return file === this[_targetSource];
	}

	isTarget(file) {
		return this.targets.has(file);
	}

	isDependency(file, target) {
		// If specific target, return true if that target's bundle has 
		if (target) {
			if (this[_dependencies].get(target).indexOf(target) => 0) return true;
		} else {
			for (let target of this[_targets]) {
				if (this[_dependencies].get(target).indexOf(target) => 0) return true;
			}
		}
		return false;
	}

	getTargetsForFile(file) {
		let ret = [];
		for (let target of this[_targets]) {
			for (let dependency of this.dependencies.get(target)) {
				if (dependency === target) ret.push(target);
			} 
		}

		return ret;
	}

	getSourceRoot() {
		return Path.resolve(Path.dirname(this[_targetFile]), this.srcDir);
	}

	/*
	Returns a generated rollup object {code, map}
	*/
	build() {
		return this[_checkInit]
			.then(this[_bundleTargets].bind(this, undefined))
			.then(this[_generate]);
	}

	change(file) {
		return this[_checkInit]
		.then(function() {
			// If source, re-analyze targets and rebuild changed/added targets
			if (this.isTargetSource(file)) {
				return this[_analyzeTargets]()
				.then(this[_bundleTargets].bind(this))
				.then(this[_generate].bind(this));
			} else {
				if (this.isTarget(file)) {
					// If target, rebuild this target
					return this[_bundleTarget](file)
						.then(this[_generate].bind(this));
				}
				if (this.isDependency(file)) {
					// If dependency, rebuild all targets dependent on this
					return this[_bundleTargets](getTargetsForFile(file))
						.then(this[_generate].bind(this));
				}
			}
		});
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
			project.build()
			.then(function(generatedFiles) {
				for (let generated of generatedFiles) {
					this.push(new File({
						cwd : process.cwd,
						base : project.getSourceRoot(),
						path : generated.target,
						contents : new Buffer(generated.code)
					}))
				}
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
			project.change(file.path)
			.then(function(generatedFiles) {
				for (let generated of generatedFiles) {
					this.push(new File({
						cwd : process.cwd,
						base : project.getSourceRoot(),
						path : generated.target,
						contents : generated.code
					}))
				}
			}.bind(this))
		});
	}
}

module.exports = {Project, build : ProjectStream.build, change : ProjectStream.change, defaultParser, defaultIdentifier, chromeExtensionIdentifier};