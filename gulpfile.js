
var gulp = require("gulp");
var babel = require("gulp-babel");
var rename = require("gulp-rename");
var plumber = require("gulp-plumber");
var lint = require('gulp-eslint');

function projectCreate() {

}

gulp.task("test", function() {
	return gulp.src("index.js")
	.pipe(plumber())
	.pipe(require("through2").obj(function(file, enc, cb) {
		console.log(file);
		this.push(file);
		cb();
	}))
	.pipe(lint())
	.pipe(lint.format())
})

gulp.task("build", function() {
	return gulp.src("index.js")
	.pipe(plumber())
	.pipe(lint())
	.pipe(lint.format())
	.pipe(babel({ modules : "umd" }))
	.pipe(rename({basename : "project-rollup"}))
	.pipe(gulp.dest("dist/"));
	gulp.watch("index.js");
})