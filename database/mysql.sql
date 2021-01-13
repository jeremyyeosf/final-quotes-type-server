drop database if exists paf2020;

create database paf2020;

use paf2020;

create table user (
	`id` INT(11) NOT NULL AUTO_INCREMENT,
	user_id varchar(64) not null UNIQUE,
	password varchar(64) not null,
	primary key(id)
);

insert into user(user_id, password) values
	('fred', sha1('fred')),
	('wilma', sha1('wilma')),
	('barney', sha1('barney')),
	('betty', sha1('betty'));



CREATE TABLE IF NOT EXISTS `contacts` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `user_id` varchar(64) not null,
  `email` varchar(64) not null,
  PRIMARY KEY (`id`),
  
  CONSTRAINT `fk_contacts_user`
    FOREIGN KEY (`user_id`)
    REFERENCES `user` (`user_id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION
  )
ENGINE = InnoDB
DEFAULT CHARACTER SET = utf8;

insert into contacts(user_id, email) values
	(1, 'fred@gmail.com');