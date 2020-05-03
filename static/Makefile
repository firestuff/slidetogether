all: check remote.js

remote.js: *.ts *.json
	tsc

check: *.ts *.json *.css
	tslint --project . --fix
	stylelint --fix *.css

clean:
	rm -f remote.js

ci:
	tslint --project .
	stylelint *.css

