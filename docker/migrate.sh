#!/bin/sh
set -e

echo "Waiting for database to be ready..."
for i in 1 2 3 4 5 6 7 8 9 10; do
	if pnpm db:migrate; then
		echo "Migrations completed successfully"
		exit 0
	fi
	echo "Database not ready yet, retrying in 2 seconds... (attempt $i/10)"
	sleep 2
done

echo "Failed to run migrations after 10 attempts"
exit 1
