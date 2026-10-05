package app

import (
	"fmt"
	"math"
	"net/mail"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"
)

var digits = regexp.MustCompile(`^\d+$`)
var phonePattern = regexp.MustCompile(`^\+[1-9]\d{7,14}$`)

func normalizePhone(s string) string {
	r := strings.NewReplacer(" ", "", "(", "", ")", "", "-", "")
	s = r.Replace(s)
	if len(s) == 11 && s[0] == '8' {
		s = "+7" + s[1:]
	}
	return s
}
func validINN(s string) bool {
	if !digits.MatchString(s) || (len(s) != 10 && len(s) != 12) {
		return false
	}
	check := func(weights []int, idx int) bool {
		sum := 0
		for i, w := range weights {
			sum += int(s[i]-'0') * w
		}
		return sum%11%10 == int(s[idx]-'0')
	}
	if len(s) == 10 {
		return check([]int{2, 4, 10, 3, 5, 9, 4, 6, 8}, 9)
	}
	return check([]int{7, 2, 4, 10, 3, 5, 9, 4, 6, 8}, 10) && check([]int{3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8}, 11)
}
func validateAnswer(q Question, v any) (any, error) {
	bad := func(message string) (any, error) { return nil, fmt.Errorf("%s", message) }
	if empty(v) {
		if q.Required {
			return bad("Ответ обязателен")
		}
		return nil, nil
	}
	switch q.Type {
	case "TEXT", "TEXTAREA", "PHONE", "EMAIL", "PASSWORD", "DATE", "TIME":
		s, ok := v.(string)
		if !ok {
			return bad("Ожидается текст")
		}
		if q.Type != "PASSWORD" {
			s = strings.TrimSpace(s)
		}
		limit := q.Validation.MaxLength
		if limit == 0 {
			limit = 4000
		}
		if utf8.RuneCountInString(s) > limit || utf8.RuneCountInString(s) < q.Validation.MinLength {
			return bad("Проверьте длину ответа")
		}
		switch q.Type {
		case "PHONE":
			s = normalizePhone(s)
			if !phonePattern.MatchString(s) {
				return bad("Введите телефон с кодом страны, например +79991234567")
			}
		case "EMAIL":
			s = strings.ToLower(s)
			a, e := mail.ParseAddress(s)
			if e != nil || a.Address != s || !strings.Contains(s, ".") {
				return bad("Введите корректный e-mail")
			}
		case "PASSWORD":
			if utf8.RuneCountInString(s) < 10 {
				return bad("Пароль слишком короткий. Используйте не менее 10 символов.")
			}
			if len(s) > 72 {
				return bad("Пароль слишком длинный. Сократите его или используйте латинские буквы, цифры и знаки.")
			}
		case "DATE":
			if _, e := time.Parse("2006-01-02", s); e != nil {
				return bad("Некорректная дата")
			}
		case "TIME":
			if _, e := time.Parse("15:04", s); e != nil {
				return bad("Некорректное время")
			}
		}
		return s, nil
	case "NUMBER":
		n, ok := v.(float64)
		if !ok || math.IsNaN(n) || math.IsInf(n, 0) {
			return bad("Введите число")
		}
		if (q.Validation.Min != nil && n < *q.Validation.Min) || (q.Validation.Max != nil && n > *q.Validation.Max) {
			return bad("Число за пределами диапазона")
		}
		return n, nil
	case "YES_NO", "CHECKBOX", "CONSENT", "CONFIRMATION":
		b, ok := v.(bool)
		if !ok {
			return bad("Ожидается да или нет")
		}
		if (q.Type == "CONSENT" || q.Type == "CONFIRMATION") && q.Required && !b {
			return bad("Необходимо подтверждение")
		}
		return b, nil
	case "INFO":
		return true, nil
	case "SINGLE_SELECT", "MULTI_SELECT":
		allowed := map[string]bool{}
		for _, o := range q.Options {
			if o.Enabled {
				allowed[o.Value] = true
			}
		}
		if q.Type == "SINGLE_SELECT" {
			s, ok := v.(string)
			if !ok || !allowed[s] {
				return bad("Вариант недоступен в этой версии сценария")
			}
			return s, nil
		}
		arr, ok := v.([]any)
		if !ok {
			return bad("Выберите варианты")
		}
		seen := map[string]bool{}
		for _, x := range arr {
			s, ok := x.(string)
			if !ok || !allowed[s] || seen[s] {
				return bad("Некорректный вариант")
			}
			seen[s] = true
		}
		return arr, nil
	case "INN_LOOKUP":
		o, e := decodeValue[OrganizationData](v)
		if e != nil || !validINN(o.INN) {
			return bad("Проверьте ИНН: длину и контрольную сумму")
		}
		if !o.Confirmed || strings.TrimSpace(o.ShortName) == "" || strings.TrimSpace(o.LegalAddress) == "" || strings.TrimSpace(o.DirectorName) == "" {
			return bad("Заполните название, адрес и ФИО руководителя / ИП, затем подтвердите организацию")
		}
		if len(o.INN) == 10 {
			if len(o.KPP) != 9 || !digits.MatchString(o.KPP) || len(o.OGRN) != 13 || !digits.MatchString(o.OGRN) {
				return bad("Для юридического лица нужны КПП (9 цифр) и ОГРН (13 цифр)")
			}
		} else if len(o.OGRNIP) != 15 || !digits.MatchString(o.OGRNIP) {
			return bad("Для ИП нужен ОГРНИП (15 цифр)")
		}
		return o, nil
	case "ADDRESS_MAP":
		a, e := decodeValue[Address](v)
		if e != nil || strings.TrimSpace(a.Address) == "" || !a.Confirmed {
			return bad("Укажите адрес и подтвердите расположение")
		}
		raw, ok := v.(map[string]any)
		if !ok {
			return bad("Некорректный адрес")
		}
		for _, k := range []string{"addressLatitude", "addressLongitude", "entranceLatitude", "entranceLongitude"} {
			if _, ok := raw[k].(float64); !ok {
				return bad("Не указаны координаты")
			}
		}
		if math.Abs(a.AddressLatitude) > 90 || math.Abs(a.EntranceLatitude) > 90 || math.Abs(a.AddressLongitude) > 180 || math.Abs(a.EntranceLongitude) > 180 {
			return bad("Некорректные координаты")
		}
		if !a.MarkerAdjusted {
			a.EntranceLatitude = a.AddressLatitude
			a.EntranceLongitude = a.AddressLongitude
		}
		return a, nil
	case "SCHEDULE":
		s, e := decodeValue[Schedule](v)
		if e != nil || len(s.Days) != 7 {
			return bad("Заполните расписание на семь дней")
		}
		enabled := 0
		for _, day := range []string{"monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"} {
			d, ok := s.Days[day]
			if !ok {
				return bad("Заполните все дни")
			}
			if !d.Enabled {
				continue
			}
			enabled++
			a, e := time.Parse("15:04", d.Opening)
			b, f := time.Parse("15:04", d.Closing)
			if e != nil || f != nil || !a.Before(b) {
				return bad("Время закрытия должно быть позже открытия")
			}
			if d.BreakEnabled {
				x, e := time.Parse("15:04", d.BreakFrom)
				y, f := time.Parse("15:04", d.BreakTo)
				if e != nil || f != nil || !x.Before(y) || x.Before(a) || y.After(b) {
					return bad("Перерыв должен быть внутри рабочего дня")
				}
			}
		}
		if enabled == 0 {
			return bad("Укажите хотя бы один рабочий день")
		}
		return s, nil
	case "PHOTO_UPLOAD", "FILE_UPLOAD":
		refs, e := decodeValue[[]FileRef](v)
		if e != nil {
			return bad("Некорректный список файлов")
		}
		max := q.Settings.MaxFiles
		if max == 0 {
			max = 8
		}
		if len(refs) > max {
			return bad("Слишком много файлов")
		}
		categories := map[string]bool{}
		ids := map[string]bool{}
		for _, r := range refs {
			if r.ID == "" || ids[r.ID] {
				return bad("Некорректный файл")
			}
			ids[r.ID] = true
			categories[r.Category] = true
		}
		for _, c := range q.Settings.RequiredCategories {
			if !categories[c] {
				return bad("Добавьте обязательные фотографии")
			}
		}
		return refs, nil
	}
	return bad("Неизвестный тип вопроса")
}
