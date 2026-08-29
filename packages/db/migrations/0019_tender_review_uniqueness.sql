CREATE UNIQUE INDEX "tender_answer_reviews_answer_reviewer_uq" ON "tender_answer_reviews" USING btree ("answer_id", "reviewer_id");--> statement-breakpoint
