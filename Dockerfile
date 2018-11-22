FROM php:7.1

EXPOSE 80/tcp
EXPOSE 8080/tcp

ADD . /var/app

CMD php /var/app/bin/server.php
