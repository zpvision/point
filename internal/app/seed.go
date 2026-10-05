package app

import (
	"context"
	"encoding/json"
)

func initialGraphs() map[string]Graph {
	makeQ := func(key, section, typ, title, binding string, required bool) Question {
		return Question{Key: key, InternalName: title, Title: title, Section: section, Type: typ, Binding: binding, Required: required, Enabled: true, Options: []Option{}, Conditions: []Condition{}}
	}
	opts := func(values ...string) []Option {
		out := []Option{}
		for i := 0; i < len(values); i += 2 {
			out = append(out, Option{values[i], values[i+1], true})
		}
		return out
	}
	user := Graph{ShowReview: true, Sections: []Section{{Code: "account", Name: "Регистрация", Description: "Основные данные"}}}
	for _, r := range [][]string{{"first_name", "TEXT", "Как вас зовут?", "user.first_name"}, {"last_name", "TEXT", "Укажите вашу фамилию", "user.last_name"}, {"phone", "PHONE", "Укажите номер телефона", "user.phone"}, {"email", "EMAIL", "Укажите e-mail", "user.email"}, {"password", "PASSWORD", "Придумайте пароль", "user.password"}, {"consent", "CONSENT", "Я принимаю условия использования сервиса и согласен с обработкой персональных данных.", "user.consent"}} {
		user.Questions = append(user.Questions, makeQ(r[0], "account", r[1], r[2], r[3], true))
	}
	point := Graph{ShowReview: true, Sections: []Section{{Code: "organization", Name: "Организация", Description: "Реквизиты и документы", Order: 0}, {Code: "point", Name: "Точка", Description: "Адрес и вход", Order: 1}, {Code: "capabilities", Name: "Возможности", Description: "Операции и вместимость", Order: 2}, {Code: "schedule", Name: "Режим работы", Order: 3}, {Code: "photos", Name: "Фотографии", Order: 4}, {Code: "contact", Name: "Контакты", Order: 5}}}
	add := func(q Question, options []Option) {
		if options != nil {
			q.Options = options
		}
		point.Questions = append(point.Questions, q)
	}
	add(makeQ("organization_type", "organization", "SINGLE_SELECT", "На кого будет оформлен Point?", "organization.type", true), opts("ip", "ИП", "ooo", "ООО", "legal_other", "Другое юридическое лицо"))
	add(makeQ("organization_inn", "organization", "INN_LOOKUP", "Введите ИНН организации или ИП", "organization.inn", true), nil)
	add(makeQ("point_address", "point", "ADDRESS_MAP", "Теперь создадим ваш Point. Укажите адрес точки.", "point.address", true), nil)
	add(makeQ("entrance_type", "point", "SINGLE_SELECT", "Где находится вход в Point?", "point.entrance_type", true), opts("street", "С улицы", "courtyard", "Со двора", "mall", "В торговом центре", "inside_shop", "Внутри другого магазина", "other", "Другое"))
	q := makeQ("courier_comment", "point", "TEXTAREA", "Подскажите, как курьеру найти вход", "point.courier_comment", false)
	q.Description = "Необязательно. Например: вход со двора, справа от аптеки, синяя дверь."
	add(q, nil)
	add(makeQ("premise_type", "point", "SINGLE_SELECT", "Какой это тип помещения?", "point.premise_type", true), opts("shop", "Магазин", "office", "Офис", "salon", "Салон", "pickup_point", "ПВЗ", "other", "Другое"))
	add(makeQ("operations", "capabilities", "MULTI_SELECT", "Какие операции доступны в вашей точке?", "point.operations", true), opts("pickup", "Выдача заказов", "dropoff", "Приём отправлений", "returns", "Возвраты"))
	add(makeQ("capacity", "capabilities", "SINGLE_SELECT", "Сколько посылок примерно может одновременно находиться у вас?", "point.storage_capacity", true), opts("20", "до 20", "50", "до 50", "100", "до 100", "200", "до 200", "200_plus", "200+"))
	add(makeQ("weight", "capabilities", "SINGLE_SELECT", "Какой максимальный вес одного отправления вы готовы принимать?", "point.max_parcel_weight", true), opts("5", "до 5 кг", "10", "до 10 кг", "20", "до 20 кг", "30", "до 30 кг"))
	add(makeQ("schedule", "schedule", "SCHEDULE", "Когда работает ваша точка?", "point.schedule", true), nil)
	q = makeQ("photos", "photos", "PHOTO_UPLOAD", "Покажите, как выглядит ваш Point", "point.photos", true)
	q.Settings = Settings{Categories: opts("facade", "Фасад / вход", "interior", "Помещение внутри", "sign", "Вывеска", "storage", "Зона хранения"), RequiredCategories: []string{"facade", "interior"}, MaxFiles: 8}
	add(q, nil)
	add(makeQ("contact_owner", "contact", "SINGLE_SELECT", "Кто будет основным контактным лицом этой точки?", "point.contact_is_owner", true), opts("SELF", "Я", "OTHER", "Другой человек"))
	for _, r := range [][]string{{"contact_name", "TEXT", "Как зовут контактное лицо?", "point.contact_name"}, {"contact_phone", "PHONE", "Телефон контактного лица", "point.contact_phone"}, {"contact_email", "EMAIL", "E-mail контактного лица", "point.contact_email"}} {
		q = makeQ(r[0], "contact", r[1], r[2], r[3], r[0] != "contact_email")
		q.Conditions = []Condition{{Source: "contact_owner", Operator: "equals", Value: "OTHER"}}
		add(q, nil)
	}
	for i := range user.Questions {
		user.Questions[i].Order = i
	}
	for i := range point.Questions {
		point.Questions[i].Order = i
	}
	return map[string]Graph{"USER_REGISTRATION": user, "POINT_REGISTRATION": point}
}
func (a *App) seed(ctx context.Context) error {
	tx, e := a.db.BeginTx(ctx, nil)
	if e != nil {
		return e
	}
	defer tx.Rollback()
	if _, e = tx.ExecContext(ctx, "SELECT pg_advisory_xact_lock(82139012)"); e != nil {
		return e
	}
	for code, g := range initialGraphs() {
		if e = g.Validate(code); e != nil {
			return e
		}
		var exists bool
		if e = tx.QueryRowContext(ctx, "SELECT EXISTS(SELECT 1 FROM questionnaire_scenarios WHERE code=$1)", code).Scan(&exists); e != nil {
			return e
		}
		if exists {
			continue
		}
		name := "Регистрация Point"
		if code == "USER_REGISTRATION" {
			name = "Регистрация пользователя"
		}
		sid, vid := newID(), newID()
		b, _ := json.Marshal(g)
		if _, e = tx.ExecContext(ctx, "INSERT INTO questionnaire_scenarios(id,code,name) VALUES($1,$2,$3)", sid, code, name); e != nil {
			return e
		}
		if _, e = tx.ExecContext(ctx, "INSERT INTO questionnaire_versions(id,scenario_id,number,status,graph,published_at) VALUES($1,$2,1,'PUBLISHED',$3,now())", vid, sid, b); e != nil {
			return e
		}
		if _, e = tx.ExecContext(ctx, "UPDATE questionnaire_scenarios SET current_version_id=$1 WHERE id=$2", vid, sid); e != nil {
			return e
		}
	}
	return tx.Commit()
}
