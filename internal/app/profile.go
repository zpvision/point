package app

import "net/http"

// A manually provisioned admin has no phone until they enter one themselves.
// Self-contact for a Point uses the profile phone, never a hidden questionnaire answer.
func (a *App) updateOwnPhone(w http.ResponseWriter, r *http.Request) error {
	u, e := a.user(r)
	if e != nil {
		return e
	}
	var in struct {
		Phone string `json:"phone"`
	}
	if e = readJSON(w, r, &in); e != nil {
		return e
	}
	value, e := validateAnswer(Question{Type: "PHONE", Required: true}, in.Phone)
	if e != nil {
		return &apiError{Status: 422, Code: "INVALID_PHONE", Message: e.Error(), QuestionKey: "phone"}
	}
	phone := value.(string)
	if _, e = a.db.ExecContext(r.Context(), "UPDATE users SET phone_verified_at=CASE WHEN phone=$1 THEN phone_verified_at ELSE NULL END,phone=$1 WHERE id=$2", phone, u.ID); e != nil {
		return e
	}
	jsonResponse(w, map[string]string{"phone": phone})
	return nil
}
