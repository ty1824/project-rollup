
var gulp = require("gulp");
var babel = require("gulp-babel");
var rename = require("gulp-rename");

function projectCreate() {

}

gulp.task("test", function() {
	
})

gulp.task("build", function() {
	gulp.src("index.js")
	.pipe(babel({ modules : "umd" }))
	.pipe(rename({basename : "project-rollup"}))
	.pipe(gulp.dest("dist/"));
})